"""Safely remove a *reviewed* spurious end sound from reported vocabulary MP3s.

No Kokoro re-synthesis or voice substitution. Audio is only changed for explicit
queue entries, each requiring a verified error category and manually chosen cut.

Usage:
  python tools/trim-reported-vocab-audio.py --check
  python tools/trim-reported-vocab-audio.py --apply

An empty queue is a no-op. All replacements are staged and validated before
any existing MP3 or the revision map is changed.
"""
from __future__ import annotations

import argparse
import array
import math
import sys
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH_PATH = ROOT / "audio/vocab/trim-batch.json"
SOURCE_PATH = ROOT / "audio/vocab/source.json"
MANIFEST_PATH = ROOT / "audio/vocab/manifest.json"
REVISIONS_PATH = ROOT / "audio/vocab/repaired-revisions.json"
BATCH_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
WORD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
PATH_PATTERN = re.compile(r"^audio/vocab/(?:openjlpt/)?[A-Za-z0-9_-]+-(?:word|ex[1-9]\d*)\.mp3$")
ERROR_TYPE = "문장 끝에 이상한 소리"


def load_json(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return data


def check_batch() -> list[dict]:
    cfg = load_json(BATCH_PATH)
    if cfg.get("version") != 1 or not isinstance(cfg.get("batch_id"), str) or not BATCH_ID_PATTERN.fullmatch(cfg["batch_id"]):
        raise ValueError("Invalid version or batch_id")
    items = cfg.get("items")
    if not isinstance(items, list) or len(items) > 20:
        raise ValueError("Expected at most 20 trim targets")
    if not items:
        print("No reviewed end-sound MP3s queued; nothing to change.")
        return []

    source = load_json(SOURCE_PATH)
    manifest = load_json(MANIFEST_PATH)
    source_by_key = {(s["id"], s["kind"], s["index"]): s["path"] for s in source["items"]}
    seen = set()
    targets = []
    for i, req in enumerate(items, 1):
        if not isinstance(req, dict):
            raise ValueError(f"Invalid target #{i}")
        wid, kind, idx = req.get("word_id"), req.get("kind"), req.get("index")
        if not isinstance(wid, str) or not WORD_ID_PATTERN.fullmatch(wid):
            raise ValueError(f"Invalid word_id in target #{i}")
        if kind not in {"word", "example"} or (kind == "word" and idx is not None) or (kind == "example" and (type(idx) is not int or idx < 0 or idx > 9)):
            raise ValueError(f"Invalid audio kind/index: {wid}")
        if req.get("error_type") != ERROR_TYPE or req.get("reviewed") is not True:
            raise ValueError(f"Only reviewed '{ERROR_TYPE}' reports may be trimmed: {wid}")
        reports = req.get("report_ids")
        if not isinstance(reports, list) or not (1 <= len(reports) <= 40) or any(type(r) is not int or r <= 0 for r in reports):
            raise ValueError(f"A real report ID is required: {wid}")
        cut_ms = req.get("remove_tail_ms")
        if type(cut_ms) is not int or not (50 <= cut_ms <= 800):
            raise ValueError(f"Reviewed remove_tail_ms must be 50..800 ms: {wid}")
        reason = req.get("reason", "")
        if not isinstance(reason, str) or len(reason) > 280:
            raise ValueError(f"Invalid reason: {wid}")
        key = (wid, kind, idx)
        if key in seen:
            raise ValueError(f"Duplicate target: {key}")
        seen.add(key)
        entry = manifest.get("files", {}).get(wid)
        if not isinstance(entry, dict) or key not in source_by_key:
            raise ValueError(f"Target missing from source/manifest: {key}")
        if kind == "word":
            rel, expected = entry.get("word"), f"{wid}-word.mp3"
        else:
            ex = entry.get("examples", [])
            rel, expected = (ex[idx] if isinstance(ex, list) and idx < len(ex) else None), f"{wid}-ex{idx + 1}.mp3"
        if not isinstance(rel, str) or not PATH_PATTERN.fullmatch(rel) or Path(rel).name != expected or rel != source_by_key[key]:
            raise ValueError(f"Source/manifest MP3 path mismatch: {key}")
        path = ROOT / rel
        if path.is_symlink() or not path.is_file() or path.stat().st_size < 1000:
            raise ValueError(f"Existing MP3 missing or unsafe: {rel}")
        targets.append({"path": path, "relative": rel, "remove_tail_ms": cut_ms, "report_ids": reports})
    for t in targets:
        print("TRIM", t["relative"], "TAIL_MS", t["remove_tail_ms"], "REPORTS", t["report_ids"])
    return targets


def probe_mp3(path: Path) -> float:
    data = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
        "-of", "json", str(path),
    ], text=True))
    streams = data.get("streams", [])
    if len(streams) != 1 or streams[0].get("codec_name") != "mp3":
        raise RuntimeError(f"Unexpected audio format: {path}")
    duration = float(data["format"]["duration"])
    if not 0.3 < duration < 45.0:
        raise RuntimeError(f"Unexpected clip duration: {path}: {duration}")
    return duration


def speech_end_seconds(path: Path) -> float:
    """Match the review page's 10-ms RMS endpoint, ignoring encoded silence.

    This is the same algorithm used by audio-end-review.html: 6% peak RMS
    (minimum 0.006) and at least 3 active frames in a rolling 5-frame window.
    Never interpret the MP3 container duration as the end of speech.
    """
    raw = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
        "-ac", "1", "-ar", "24000", "-f", "f32le", "-"
    ])
    if not raw or len(raw) % 4:
        raise RuntimeError(f"Could not decode PCM: {path}")
    samples = array.array("f")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    sample_rate = 24000
    step = 240
    rms = []
    for start in range(0, len(samples), step):
        frame = samples[start:start + step]
        val = math.sqrt(sum(float(x) * float(x) for x in frame) / len(frame))
        rms.append(val)
    peak = max(rms)
    threshold = max(0.006, peak * 0.06)
    decoded_duration = len(samples) / sample_rate
    for i in range(len(rms) - 1, 3, -1):
        active = sum(1 for j in range(i-4, i+1) if rms[j] > threshold)
        if active >= 3:
            end = min(decoded_duration, (i + 1) * step / sample_rate)
            if end < 0.5:
                raise ValueError(f"Detected speech suspiciously short: {path}")
            return end
    raise ValueError(f"Could not detect speech endpoint: {path}")


def apply_trim(targets: list[dict]) -> None:
    if not targets:
        raise RuntimeError("No reviewed MP3s queued")
    revisions = load_json(REVISIONS_PATH)
    if revisions.get("version") != 1 or not isinstance(revisions.get("files"), dict):
        raise ValueError("Invalid revision map")
    staged = []
    with tempfile.TemporaryDirectory(prefix="jlpt-endtrim-") as directory:
        work = Path(directory)
        for i, target in enumerate(targets, 1):
            original = target["path"]
            duration = probe_mp3(original)
            speech_end = speech_end_seconds(original)
            removed = target["remove_tail_ms"] / 1000.0
            # Match JS review preview: fade starting 25ms after the chosen cutoff,
            # which is relative to last speech, NOT trailing file silence.
            if removed > speech_end * 0.25 or speech_end - removed < 0.5:
                raise ValueError(f"Cut would remove too much of {original}: {removed:.3f}s/{speech_end:.3f}s speech")
            end = min(duration, max(0.2, speech_end - removed + 0.025))
            if duration - end < 0.045:
                raise ValueError(f"Cut has no measurable effect on {original}")
            fade = min(0.025, end / 20)
            output = work / f"{i}.mp3"
            filters = (f"aresample=24000,asetpts=N/SR/TB,"
                       f"atrim=end={end:.6f},asetpts=N/SR/TB,"
                       f"afade=t=out:st={end - fade:.6f}:d={fade:.6f},apad=pad_dur=0.12")
            subprocess.run([
                "ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", str(original),
                "-af", filters, "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame",
                "-b:a", "48k", str(output),
            ], check=True)
            new_duration = probe_mp3(output)
            if abs(new_duration - (end + 0.12)) > 0.16 or output.stat().st_size < 2500:
                raise RuntimeError(f"Bad trimmed MP3: {original} duration {new_duration:.3f}s")
            data = output.read_bytes()
            old_sha = hashlib.sha256(original.read_bytes()).hexdigest()
            new_sha = hashlib.sha256(data).hexdigest()
            if old_sha == new_sha:
                raise RuntimeError(f"Unchanged audio: {original}")
            staged.append((target, data, new_sha[:16]))
            print(f"[{i}/{len(targets)}] Staged {target['relative']}: file={duration:.2f}s speech_end={speech_end:.2f}s preview_cut={removed:.2f}s -> {new_duration:.2f}s")

        for target, data, _ in staged:
            target["path"].write_bytes(data)
    for target, _, revision in staged:
        revisions["files"][target["relative"]] = revision
    REVISIONS_PATH.write_text(json.dumps(revisions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: {len(staged)} reviewed MP3 endings trimmed, revisions updated; no new voice model used.")
    print("NOTICE: Format validation does not replace listening to the final Japanese mora.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.check == args.apply:
        parser.error("Choose exactly one of --check / --apply")
    targets = check_batch()
    if args.apply:
        apply_trim(targets)


if __name__ == "__main__":
    main()
