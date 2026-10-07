import json
import os
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline
from misaki import ja

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "audio" / "vocab" / "source.json"
OUT = ROOT / "audio" / "vocab"

data = json.loads(SOURCE.read_text(encoding="utf-8"))
items = data["items"]
missing = [item for item in items if not (ROOT / item["path"]).exists()]
print(f"Vocabulary clips: {len(items)} total, {len(missing)} missing")

if missing:
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 2)))
    pipeline = KPipeline(lang_code="j", repo_id="hexgrad/Kokoro-82M", device="cpu")
    # Misaki's newer pyopenjtalk frontend gives better Japanese phrase/pitch handling
    # and avoids downloading a separate full UniDic archive on every Actions run.
    pipeline.g2p = ja.JAG2P(version="pyopenjtalk")

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
        sf.write(target, np.concatenate(chunks), 24000, subtype="PCM_16")
        print(f"[{n:03d}/{len(missing)}] {item['path']}")

files = {}
for item in items:
    entry = files.setdefault(item["id"], {"word": None, "examples": []})
    if item["kind"] == "word":
        entry["word"] = item["path"]
    else:
        idx = int(item["index"])
        while len(entry["examples"]) <= idx:
            entry["examples"].append(None)
        entry["examples"][idx] = item["path"]

manifest = {
    "version": 2,
    "engine": "Kokoro-82M / jf_alpha",
    "count": len(items),
    "files": files,
}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Done: {len(items)} clips in manifest")
