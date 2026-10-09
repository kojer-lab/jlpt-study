"""Diagnostic ONLY: inspect endings of reported JLPT vocabulary MP3s.

Measures PCM RMS and quiet gaps, without altering files. An independent
short terminal sound separated by silence is a *candidate*, not proof of an
incorrect Japanese mora. Do not auto-approve trimming from this report.
"""
from __future__ import annotations

import array
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "audio/vocab/end-sound-diagnostic-queue.json"
RESULT = ROOT / "audio/vocab/end-sound-diagnostics.json"
MANIFEST = ROOT / "audio/vocab/manifest.json"


def diagnose(path: Path) -> dict:
    pcm = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
        "-ac", "1", "-ar", "24000", "-f", "s16le", "-"
    ])
    samples = array.array("h")
    samples.frombytes(pcm)
    if not samples:
        raise ValueError(f"Empty MP3 {path}")
    if __import__("sys").byteorder == "big":
        samples.byteswap()
    step = 240  # 10 ms at 24 kHz
    rms = []
    for j in range(0, len(samples), step):
        frame = samples[j:j + step]
        if not frame:
            continue
        rms.append(math.sqrt(sum(s*s for s in frame) / len(frame)) / 32768)
    duration = len(samples) / 24000
    peak = max(rms)
    threshold = max(0.006, peak * 0.06)
    raw_groups = []
    start = None
    for i, val in enumerate(rms + [0]):
        on = val >= threshold
        if on and start is None:
            start = i
        elif not on and start is not None:
            raw_groups.append([start*0.01, i*0.01])
            start = None
    # Smooth tiny natural speech gaps and ignore individual noise clicks.
    groups = []
    for st, en in raw_groups:
        if groups and st - groups[-1][1] <= 0.035:
            groups[-1][1] = en
        else:
            groups.append([st, en])
    groups = [g for g in groups if g[1] - g[0] >= 0.035]
    if not groups:
        return {"duration_s":round(duration,3),"peak_rms":round(peak,5),"threshold":round(threshold,5),"segments":[],"candidate":None,"reason":"No reliable sound regions"}
    segments = []
    for start,end in groups[-12:]:
        segments.append({"start_s":round(start,3),"end_s":round(end,3),"length_s":round(end-start,3)})
    candidate = None
    reason = "No clearly separated short terminal sound"
    if len(groups) >= 2:
        prev, tail = groups[-2], groups[-1]
        gap = tail[0]-prev[1]
        tail_len = tail[1]-tail[0]
        tail_after = duration-tail[1]
        candidate_start = prev[1]+min(0.035, max(0.0,gap*0.33))
        tail_to_remove = duration-candidate_start
        if (gap >= 0.09 and 0.05 <= tail_len <= 0.38
                and tail_after <= 0.35 and tail[0] > duration-0.95
                and 0.05 <= tail_to_remove <= 0.8
                and tail_to_remove <= duration*0.25):
            candidate = {"remove_tail_ms":round(tail_to_remove*1000),
                         "silence_gap_ms":round(gap*1000),
                         "last_segment_ms":round(tail_len*1000),
                         "cut_position_s":round(candidate_start,3)}
            reason = "Potential isolated trailing sound; listening/reading review required"
        else:
            reason = ("Last sound not safely isolated: gap=%.3fs tail=%.3fs "
                      "trailing_silence=%.3fs" % (gap,tail_len,tail_after))
    tail_frames = rms[max(0,len(rms)-120):]
    # Downsample visual evidence into 20ms RMS pairs.
    rms_tail = [round(max(tail_frames[k:k+2]),4) for k in range(0,len(tail_frames),2)]
    return {"duration_s":round(duration,3),"peak_rms":round(peak,5),
            "threshold":round(threshold,5),"segments":segments,
            "rms_tail_20ms":rms_tail,"candidate":candidate,"reason":reason}


def main() -> None:
    config = json.loads(QUEUE.read_text(encoding="utf-8"))
    entries = config.get("items",[])
    if len(entries)>20 or not isinstance(entries,list):
        raise ValueError("Expected up to 20 targets")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    results=[]
    seen=set()
    for item in entries:
        wid=item.get("word_id")
        kind=item.get("kind")
        idx=item.get("index")
        rid=item.get("report_id")
        if (not isinstance(wid,str) or not wid.isascii() or not wid.replace("_","").replace("-","").isalnum()
            or kind not in ("word","example") or type(rid) is not int or rid < 1
            or (kind=="word" and idx is not None)
            or (kind=="example" and (type(idx) is not int or idx<0 or idx>9))):
            raise ValueError("Invalid report target")
        key=(wid,kind,idx)
        if key in seen:
            raise ValueError("Duplicate audio target")
        seen.add(key)
        record=manifest.get("files",{}).get(wid)
        if not isinstance(record,dict):
            raise ValueError("Unknown word ID")
        if kind=="word":
            rel=record.get("word")
        else:
            ex=record.get("examples",[])
            rel=ex[idx] if idx<len(ex) else None
        if not isinstance(rel,str) or not rel.startswith("audio/vocab/") or not rel.endswith(".mp3") or ".." in rel:
            raise ValueError("Invalid MP3 manifest path")
        path=ROOT / rel
        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing or unsafe MP3")
        entry={"report_id":rid,"word_id":wid,"kind":kind,"index":idx,"path":rel}
        entry.update(diagnose(path))
        results.append(entry)
        print(f"Report #{rid}: {rel}: {entry['reason']} candidate={entry['candidate']}")
    RESULT.write_text(json.dumps({"version":1,"batch_id":config["batch_id"],"items":results},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Analyzed {len(results)} reported MP3s, no MP3 was changed")


if __name__=="__main__":
    main()
