"""Render 100 Japanese listening conversations into one 64 kbps mono MP3 each.

Uses the same native Kokoro frontend as the vocabulary MP3 workflow.
LISTENING_AUDIO_BATCH_INDEX=0..9 limits production to 10 questions per batch.
Generated filenames include a signature of the exact script and voice choices.
"""
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "audio" / "listening" / "source.json"
items = json.loads(SOURCE.read_text(encoding="utf-8"))["items"]
if len(items) != 100:
    raise RuntimeError(f"Expected 100 listening questions, got {len(items)}")

batch = os.environ.get("LISTENING_AUDIO_BATCH_INDEX")
if batch is not None:
    n = int(batch)
    if not (0 <= n < 10):
        raise RuntimeError("LISTENING_AUDIO_BATCH_INDEX must be 0..9")
    items = items[n * 10:(n + 1) * 10]
missing = [item for item in items if not (ROOT / item["path"]).is_file()]
print(f"Listening MP3 batch: {len(missing)} missing of {len(items)} selected questions", flush=True)

if missing:
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline
    from misaki import ja

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 2)))
    old_frontend = ja.JAG2P
    try:
        ja.JAG2P = lambda *args, **kwargs: old_frontend(version="pyopenjtalk")
        pipeline = KPipeline(lang_code="j", repo_id="hexgrad/Kokoro-82M", device="cpu")
    finally:
        ja.JAG2P = old_frontend

    sr = 24000
    pause = np.zeros(round(sr * 0.22), dtype=np.float32)
    for i, item in enumerate(missing, 1):
        path = ROOT / item["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        segments = []
        for n, (text, voice) in enumerate(item["lines"]):
            # Kokoro Japanese sometimes verbalizes final 。 oddly; omit terminal punctuation.
            spoken = re.sub(r"。(?=[」』]?\s*$)", "", text.strip()).strip()
            if not spoken:
                raise RuntimeError(f"Question {item['index']} has empty spoken text")
            clips = []
            for result in pipeline(spoken, voice=voice, speed=1.0):
                audio = result.audio if hasattr(result, "audio") else result[2]
                if audio is None:
                    continue
                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().numpy()
                clips.append(np.asarray(audio, dtype=np.float32).reshape(-1))
            if not clips:
                raise RuntimeError(f"Question {item['index']} line {n+1}: no generated speech")
            if segments:
                segments.append(pause)
            segments.append(np.concatenate(clips))
        audio = np.concatenate(segments)
        temporary_wav = path.with_suffix(".tmp.wav")
        temporary_mp3 = path.with_suffix(".tmp.mp3")
        try:
            sf.write(temporary_wav, audio, sr, subtype="PCM_16")
            subprocess.run([
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(temporary_wav),
                "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame",
                "-b:a", "64k", str(temporary_mp3)
            ], check=True)
            if temporary_mp3.stat().st_size < 3000:
                raise RuntimeError(f"Unexpected tiny MP3: {item['path']}")
            temporary_mp3.replace(path)
        finally:
            temporary_wav.unlink(missing_ok=True)
            temporary_mp3.unlink(missing_ok=True)
        print(f"[{i}/{len(missing)}] Question {item['index']}/100: {item['path']} ({path.stat().st_size} bytes)", flush=True)
print("Listening MP3 generation complete for requested batch.", flush=True)
