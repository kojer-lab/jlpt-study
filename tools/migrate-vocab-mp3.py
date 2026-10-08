"""Convert the existing 800 Kokoro WAV clips to compact MP3, atomically.

This script never publishes an MP3 path in the manifest until every conversion
has been verified. The original WAVs are removed only after validation.
It is safe to rerun after a partially completed conversion.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "audio/vocab/manifest.json"
SOURCE = ROOT / "audio/vocab/source.json"
BITRATE = "64k"


def duration(path: Path) -> float:
    output = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nokey=1:noprint_wrappers=1", str(path)],
        text=True,
    ).strip()
    return float(output)


def validate(original: Path, converted: Path) -> None:
    if not converted.is_file() or converted.stat().st_size < 1000:
        raise RuntimeError(f"Missing or empty MP3: {converted}")
    source_length, target_length = duration(original), duration(converted)
    if source_length <= 0 or target_length <= 0:
        raise RuntimeError(f"Invalid clip length: {converted}")
    if abs(source_length - target_length) > 0.30:
        raise RuntimeError(
            f"MP3 length mismatch: {original} ({source_length}s) => "
            f"{converted} ({target_length}s)"
        )


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    wav_paths = []
    for entry in manifest["files"].values():
        for path in [entry.get("word"), *entry.get("examples", [])]:
            if isinstance(path, str) and path.endswith(".wav"):
                wav_paths.append(path)

    wav_paths = sorted(set(wav_paths))
    source_wavs = {item["path"] for item in source["items"]
                   if item["path"].endswith(".wav")}
    if source_wavs != set(wav_paths):
        raise RuntimeError(
            f"Source and manifest disagree: manifest {len(wav_paths)} WAV, "
            f"source {len(source_wavs)} WAV"
        )

    print(f"Converting {len(wav_paths)} WAV clips to {BITRATE} MP3")
    before = after = 0
    for i, rel in enumerate(wav_paths, 1):
        wav = ROOT / rel
        mp3 = wav.with_suffix(".mp3")
        if not wav.exists():
            raise FileNotFoundError(wav)
        before += wav.stat().st_size
        try:
            validate(wav, mp3)
        except (FileNotFoundError, RuntimeError, ValueError, subprocess.CalledProcessError):
            temp = mp3.with_suffix(".tmp.mp3")
            try:
                subprocess.run(
                    ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", str(wav),
                     "-vn", "-codec:a", "libmp3lame", "-b:a", BITRATE,
                     "-ar", "24000", "-ac", "1", str(temp)],
                    check=True,
                )
                validate(wav, temp)
                temp.replace(mp3)
            finally:
                temp.unlink(missing_ok=True)
        after += mp3.stat().st_size
        if i % 100 == 0 or i == len(wav_paths):
            print(f"Validated {i}/{len(wav_paths)} clips")

    # Rewrite both indexes only when all target files are proven usable.
    def replace_path(value):
        return value[:-4] + ".mp3" if isinstance(value, str) and value.endswith(".wav") else value

    for entry in manifest["files"].values():
        entry["word"] = replace_path(entry.get("word"))
        entry["examples"] = [replace_path(value) for value in entry.get("examples", [])]
    for item in source["items"]:
        item["path"] = replace_path(item["path"])
    manifest["version"] = max(int(manifest.get("version", 2)), 3)
    manifest["legacyWavMigration"] = "MP3 mono 24kHz, 64 kbps"

    # Ensure every path referenced after migration actually exists.
    for item in source["items"]:
        if not (ROOT / item["path"]).is_file():
            raise FileNotFoundError(f"Manifest target missing: {item['path']}")
    for obj, path in [(manifest, MANIFEST), (source, SOURCE)]:
        temp = path.with_suffix(".json.tmp")
        temp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(path)

    for rel in wav_paths:
        (ROOT / rel).unlink()

    print(f"Complete: {len(wav_paths)} MP3 clips; WAV {before / 1048576:.1f} MiB "
          f"=> MP3 {after / 1048576:.1f} MiB")
    print(f"Indexed clips: {len(source['items'])}; remaining WAV paths: 0")


if __name__ == "__main__":
    main()
