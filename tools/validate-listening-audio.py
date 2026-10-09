"""Check that all 100 listening MP3 files are present, decodable and indexed."""
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = json.loads((root / "audio/listening/source.json").read_text(encoding="utf-8"))
items = source["items"]
errors = []
if len(items) != 100 or source["count"] != 100 or source["lines"] != 434:
    errors.append(f"Unexpected question/line count: {source.get('count')} / {source.get('lines')}")
seen = set()
for item in items:
    path = item["path"]
    if path in seen or not path.startswith("audio/listening/") or not path.endswith(".mp3") or ".." in Path(path).parts:
        errors.append(f"Unsafe or repeated audio path: {path}")
        continue
    seen.add(path)
    target = root / path
    if not target.is_file() or target.stat().st_size < 3000:
        errors.append(f"Missing/empty MP3: {path}")
        continue
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=codec_name:format=duration",
         "-of", "json", str(target)], capture_output=True, text=True)
    if probe.returncode:
        errors.append(f"MP3 decode/metadata error: {path}")
        continue
    try:
        info = json.loads(probe.stdout)
        duration = float(info["format"]["duration"])
        codec = info["streams"][0]["codec_name"]
        if codec != "mp3" or not (3 < duration < 300):
            errors.append(f"Invalid audio: {path} (codec={codec}, duration={duration:.1f}s)")
    except (KeyError, TypeError, ValueError, IndexError):
        errors.append(f"Invalid ffprobe data: {path}")

manifest_path = root / "audio/listening/manifest.json"
if manifest_path.is_file():
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected = {item["key"]: item["path"] for item in items}
    if manifest.get("count") != 100 or manifest.get("files") != expected:
        errors.append("Manifest does not match the 100 generated audio files")

for err in errors[:30]:
    print("ERROR:", err, file=sys.stderr)
if errors:
    sys.exit(1)
print(f"PASS: {len(items)} complete listening MP3s / {source['lines']} spoken segments validated.")
