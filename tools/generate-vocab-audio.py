import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "audio" / "vocab" / "source.json"
OUT = ROOT / "audio" / "vocab"

data = json.loads(SOURCE.read_text(encoding="utf-8"))
items = data["items"]
missing = [item for item in items if not (ROOT / item["path"]).exists()]
# Explicit re-synthesis of exactly 500 legacy example clips; never touch word clips.
legacy_batch = os.environ.get("VOCAB_AUDIO_LEGACY_BATCH")
if legacy_batch is not None:
    import csv
    import io
    import re
    audit = (ROOT / "docs/legacy-wav-mp3-audit.md").read_text(encoding="utf-8")
    csv_block = audit.split("```csv", 1)[1].split("```", 1)[0].strip()
    legacy_paths = sorted(row["current_mp3_path"] for row in csv.DictReader(io.StringIO(csv_block))
                          if row["kind"] == "example")
    if len(legacy_paths) != 500 or len(set(legacy_paths)) != 500:
        raise RuntimeError(f"Expected exactly 500 unique legacy examples, got {len(legacy_paths)}")
    by_path = {item["path"]: item for item in items}
    if any(p not in by_path or by_path[p]["kind"] != "example" for p in legacy_paths):
        raise RuntimeError("Legacy MP3 list differs from currently exported example list")
    batch = int(legacy_batch)
    if not (0 <= batch < 10):
        raise RuntimeError("Legacy batch index must be 0 through 9")
    missing = [dict(by_path[p]) for p in legacy_paths[batch * 50:(batch + 1) * 50]]
    for item in missing:
        item["text"] = re.sub(r"。(?=[」』]?\s*$)", "", item["text"]).strip()
        if not item["text"] or item["text"].endswith("。"):
            raise RuntimeError(f"Unsafe example text: {item['path']}")
batch_size = int(os.environ.get("VOCAB_AUDIO_BATCH_SIZE", "0"))
if batch_size > 0:
    missing = missing[:batch_size]
print(f"Vocabulary clips: {len(items)} total, generating {len(missing)} missing this batch")

if missing:
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    from misaki import ja

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 2)))
    # KPipeline normally constructs Misaki's default Japanese frontend first.
    # That frontend expects a downloaded UniDic dictionary, which is unnecessary
    # here and caused GitHub Actions to fail before we could replace it.
    original_jag2p = ja.JAG2P
    try:
        ja.JAG2P = lambda *args, **kwargs: original_jag2p(version="pyopenjtalk")
        pipeline = KPipeline(lang_code="j", repo_id="hexgrad/Kokoro-82M", device="cpu")
    finally:
        ja.JAG2P = original_jag2p

    for n, item in enumerate(missing, 1):
        target = ROOT / item["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        chunks = []
        for result in pipeline(item["text"], voice=item.get("voice", "jf_alpha"), speed=1.0):
            audio = result.audio if hasattr(result, "audio") else result[2]
            if audio is None:
                continue
            if hasattr(audio, "detach"):
                audio = audio.detach().cpu().numpy()
            chunks.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        if not chunks:
            raise RuntimeError(f"No audio generated for {item['path']}: {item['text']}")
        audio = np.concatenate(chunks)
        if target.suffix.lower() == ".mp3":
            tmp = target.with_suffix(".tmp.wav")
            sf.write(tmp, audio, 24000, subtype="PCM_16")
            try:
                subprocess.run([
                    "ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp),
                    "-codec:a", "libmp3lame", "-b:a", "48k", str(target)
                ], check=True)
            finally:
                tmp.unlink(missing_ok=True)
        else:
            sf.write(target, audio, 24000, subtype="PCM_16")
        print(f"[{n:03d}/{len(missing)}] {item['path']}")

files = {}
for item in items:
    # Never publish an ungenerated MP3 URL to mobile Safari.
    if not (ROOT / item["path"]).is_file():
        continue
    entry = files.setdefault(item["id"], {"word": None, "examples": []})
    if item["kind"] == "word":
        entry["word"] = item["path"]
    else:
        idx = int(item["index"])
        while len(entry["examples"]) <= idx:
            entry["examples"].append(None)
        entry["examples"][idx] = item["path"]

manifest = {
    "version": 3,
    "engine": "Kokoro-82M / jf_alpha",
    "count": sum(1 for item in items if (ROOT / item["path"]).is_file()),
    "files": files,
}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Done: {manifest['count']}/{len(items)} clips in manifest")
