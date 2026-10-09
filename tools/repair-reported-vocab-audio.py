"""Rebuild reviewed JLPT vocabulary audio reports in one Kokoro session.

Usage:
  python tools/repair-reported-vocab-audio.py --check
  python tools/repair-reported-vocab-audio.py --generate

Edit audio/vocab/repair-batch.json only after reviewing reported pronunciation.
A successful build publishes all requested MP3s together; failed builds never push.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH_PATH = ROOT / "audio/vocab/repair-batch.json"
SOURCE_PATH = ROOT / "audio/vocab/source.json"
MANIFEST_PATH = ROOT / "audio/vocab/manifest.json"
REVISIONS_PATH = ROOT / "audio/vocab/repaired-revisions.json"
BATCH_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
WORD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
PATH_PATTERN = re.compile(r"^audio/vocab/(?:openjlpt/)?[A-Za-z0-9_-]+-(?:word|ex[1-9]\d*)\.mp3$")


def load_json(path: Path) -> dict:
    result = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(result, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return result


def check_batch() -> list[dict]:
    """Validate reviewed input against the canonical source and live manifest."""
    cfg = load_json(BATCH_PATH)
    if cfg.get("version") != 1 or not isinstance(cfg.get("batch_id"), str):
        raise ValueError("Expected version 1 and a batch_id")
    if not BATCH_ID_PATTERN.fullmatch(cfg["batch_id"]):
        raise ValueError("Invalid batch_id")
    items = cfg.get("items")
    if not isinstance(items, list) or len(items) > 20:
        raise ValueError("A batch needs a list of at most 20 audio targets")
    if not items:
        print("Batch queue empty: no MP3s to change.")
        return []

    source = load_json(SOURCE_PATH)
    manifest = load_json(MANIFEST_PATH)
    source_by_key = {
        (s["id"], s["kind"], s["index"]): s
        for s in source["items"]
    }
    targets = []
    seen = set()
    for num, req in enumerate(items, 1):
        if not isinstance(req, dict):
            raise ValueError(f"Invalid request #{num}")
        word_id = req.get("word_id")
        kind = req.get("kind")
        index = req.get("index")
        text = req.get("spoken_text")
        if not isinstance(word_id, str) or not WORD_ID_PATTERN.fullmatch(word_id):
            raise ValueError(f"Invalid word ID in request #{num}")
        if kind not in ("word", "example"):
            raise ValueError(f"Invalid kind in request #{num}")
        if kind == "word":
            if index is not None:
                raise ValueError("Word audio must have null index")
        elif type(index) is not int or not (0 <= index < 10):
            raise ValueError("Example index must be 0..9")
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
            raise ValueError(f"Reviewed spoken_text is mandatory: {word_id}")
        if text != text.strip() or any(ord(ch) < 32 for ch in text):
            raise ValueError(f"Unsafe pronunciation text: {word_id}")
        if not any("\u3040" <= ch <= "\u30ff" or "\u3400" <= ch <= "\u9fff" for ch in text):
            raise ValueError(f"Pronunciation must contain Japanese: {word_id}")
        reports = req.get("report_ids", [])
        if not isinstance(reports, list) or len(reports) > 40 or any(type(r) is not int or r <= 0 for r in reports):
            raise ValueError(f"Invalid Supabase report IDs: {word_id}")
        reason = req.get("reason", "")
        if not isinstance(reason, str) or len(reason) > 280:
            raise ValueError(f"Invalid reason: {word_id}")
        key = (word_id, kind, index)
        if key in seen:
            raise ValueError(f"Duplicate target in batch: {key}")
        seen.add(key)
        source_item = source_by_key.get(key)
        entry = manifest.get("files", {}).get(word_id)
        if source_item is None or not isinstance(entry, dict):
            raise ValueError(f"Word not found in source/manifest: {word_id}")
        if kind == "word":
            rel = entry.get("word")
            expected_name = f"{word_id}-word.mp3"
        else:
            example_paths = entry.get("examples", [])
            rel = example_paths[index] if index < len(example_paths) else None
            expected_name = f"{word_id}-ex{index + 1}.mp3"
        if (
            not isinstance(rel, str)
            or not PATH_PATTERN.fullmatch(rel)
            or Path(rel).name != expected_name
            or source_item["path"] != rel
        ):
            raise ValueError(f"Source and manifest mismatch for {key}: {rel}")
        path = ROOT / rel
        if path.is_symlink() or not path.is_file() or path.stat().st_size < 1000:
            raise ValueError(f"Existing MP3 is missing, linked, or empty: {rel}")
        targets.append({
            "path": path, "relative": rel, "spoken_text": text,
            "word_id": word_id, "kind": kind, "index": index,
            "report_ids": reports,
        })
    print(f"Validated batch {cfg['batch_id']}: {len(targets)} unique MP3s")
    for t in targets:
        print("TARGET", t["relative"], "SUPABASE_REPORTS", t["report_ids"])
    return targets


def resynthesize(targets: list[dict]) -> None:
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    from misaki import ja

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 2)))
    original_jag2p = ja.JAG2P
    try:
        ja.JAG2P = lambda *args, **kwargs: original_jag2p(version="pyopenjtalk")
        pipeline = KPipeline(lang_code="j", repo_id="hexgrad/Kokoro-82M", device="cpu")
    finally:
        ja.JAG2P = original_jag2p

    staged = []
    with tempfile.TemporaryDirectory(prefix="jlpt-repair-") as temp_dir:
        temp = Path(temp_dir)
        for i, t in enumerate(targets, 1):
            chunks = []
            for out in pipeline(t["spoken_text"], voice="jf_alpha", speed=1.0):
                a = out.audio if hasattr(out, "audio") else out[2]
                if a is None:
                    continue
                if hasattr(a, "detach"):
                    a = a.detach().cpu().numpy()
                chunks.append(np.asarray(a, dtype=np.float32).reshape(-1))
            if not chunks:
                raise RuntimeError(f"No generated sound: {t['relative']}")
            audio = np.concatenate(chunks)
            if not np.isfinite(audio).all():
                raise RuntimeError(f"Invalid waveform: {t['relative']}")
            peak = float(np.max(np.abs(audio)))
            if not 0.012 < peak <= 1.01:
                raise RuntimeError(f"Unexpected amplitude {peak}: {t['relative']}")
            duration = len(audio) / 24000.0
            if not (0.3 < duration < 45.0):
                raise RuntimeError(f"Unexpected duration {duration}: {t['relative']}")
            # Avoid abrupt PCM boundary clicks, without deleting the final mora.
            fade = min(480, max(1, len(audio) // 15))
            audio[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
            audio = np.concatenate([audio, np.zeros(2880, dtype=np.float32)])
            wav = temp / f"{i}.wav"
            mp3 = temp / f"{i}.mp3"
            sf.write(wav, audio, 24000, subtype="PCM_16")
            subprocess.run([
                "ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", str(wav),
                "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame",
                "-b:a", "48k", str(mp3),
            ], check=True)
            probe = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries",
                "stream=codec_name,sample_rate:format=duration", "-of", "json", str(mp3),
            ], text=True))
            info = probe["streams"][0]
            mp3_duration = float(probe["format"]["duration"])
            if info.get("codec_name") != "mp3" or info.get("sample_rate") != "24000":
                raise RuntimeError(f"Invalid MP3 format: {t['relative']}")
            if not 0.3 < mp3_duration < 45 or abs(mp3_duration - len(audio) / 24000) > 0.4:
                raise RuntimeError(f"Invalid MP3 duration: {t['relative']}")
            if mp3.stat().st_size < 2500:
                raise RuntimeError(f"MP3 too small: {t['relative']}")
            data = mp3.read_bytes()
            oldhash = hashlib.sha256(t["path"].read_bytes()).hexdigest()
            newhash = hashlib.sha256(data).hexdigest()
            if oldhash == newhash:
                raise RuntimeError(f"Regenerated file identical to original: {t['relative']}")
            staged.append((t, data, newhash[:16]))
            print(f"[{i}/{len(targets)}] OK {t['relative']} {mp3_duration:.2f}s {oldhash[:10]} -> {newhash[:10]}")

        # Only publish local replacements after ALL clips pass their checks.
        for t, data, _ in staged:
            t["path"].write_bytes(data)

    revision_data = load_json(REVISIONS_PATH)
    if revision_data.get("version") != 1 or not isinstance(revision_data.get("files"), dict):
        raise RuntimeError("Invalid repair revision map")
    for t, _, revision in staged:
        revision_data["files"][t["relative"]] = revision
    REVISIONS_PATH.write_text(
        json.dumps(revision_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"PASS: {len(staged)} MP3s corrected, one Kokoro model load, one deployment batch.")
    print("NOTICE: Mechanical validation cannot establish whether a Japanese reading sounds natural.")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true")
    p.add_argument("--generate", action="store_true")
    args = p.parse_args()
    if args.check == args.generate:
        p.error("Choose exactly one: --check or --generate")
    targets = check_batch()
    if args.generate:
        if not targets:
            raise RuntimeError("No reviewed reports to generate")
        resynthesize(targets)


if __name__ == "__main__":
    main()
