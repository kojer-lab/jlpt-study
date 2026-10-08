"""Validate vocabulary MP3 assets against the exported source and manifest."""
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = json.loads((root / "audio/vocab/source.json").read_text(encoding="utf-8"))
manifest = json.loads((root / "audio/vocab/manifest.json").read_text(encoding="utf-8"))
items = source["items"]
errors = []
expected = {}
for item in items:
    path = item["path"]
    if not path.endswith(".mp3") or Path(path).is_absolute() or ".." in Path(path).parts:
        errors.append(f"Invalid MP3 path: {path}")
        continue
    if path in expected:
        errors.append(f"Duplicate audio path: {path}")
    expected[path] = item
    entry = manifest.get("files", {}).get(item["id"], {})
    if item["kind"] == "word":
        registered = entry.get("word")
    else:
        examples = entry.get("examples", [])
        index = int(item["index"])
        registered = examples[index] if index < len(examples) else None
    file = root / path
    if file.is_file():
        if registered != path:
            errors.append(f"Manifest mismatch: {path} -> {registered}")
        if file.stat().st_size < 1000:
            errors.append(f"Empty MP3: {path}")
    elif registered is not None:
        errors.append(f"Manifest points to missing MP3: {path}")

listed = set()
for entry in manifest.get("files", {}).values():
    if entry.get("word"):
        listed.add(entry["word"])
    listed.update(p for p in entry.get("examples", []) if p)
existing = {p for p in expected if (root / p).is_file()}
if listed != existing:
    errors.append(f"Manifest path mismatch: {len(listed - existing)} extra, {len(existing - listed)} unlisted existing")
if source.get("count") != len(items) or manifest.get("count") != len(existing):
    errors.append("Clip count mismatch")
if source.get("wordCount") != sum(i["kind"] == "word" for i in items):
    errors.append("Word count mismatch")

# ffprobe checks decode metadata, duration, and confirms the codec; no TTS dependency.
for path in expected:
    file = root / path
    if not file.is_file() or file.stat().st_size < 1000:
        continue
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=codec_name:format=duration",
         "-of", "json", str(file)],
        capture_output=True, text=True,
    )
    if proc.returncode:
        errors.append(f"Cannot probe: {path}")
        continue
    try:
        info = json.loads(proc.stdout)
        codec = info["streams"][0]["codec_name"]
        duration = float(info["format"]["duration"])
        if codec != "mp3" or not (0.1 <= duration <= 180):
            errors.append(f"Invalid codec/duration: {path} ({codec}, {duration})")
    except (ValueError, IndexError, KeyError, TypeError):
        errors.append(f"Invalid audio metadata: {path}")

print(f"Checked {len(items)} clips, {sum(i['kind'] == 'word' for i in items)} words, "
      f"{sum(i['kind'] == 'example' for i in items)} examples.")
for e in errors[:40]:
    print("ERROR:", e, file=sys.stderr)
if len(errors) > 40:
    print(f"... {len(errors) - 40} more errors", file=sys.stderr)
if errors:
    sys.exit(1)
print("PASS: source, manifest, MP3 files and audio metadata match.")
