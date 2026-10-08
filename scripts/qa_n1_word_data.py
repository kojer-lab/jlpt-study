#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BAD_TEXT = re.compile(r"[�□■]|\?\?\?")

def parse_js(path: Path):
    text = path.read_text(encoding="utf-8")
    eq = text.find("=")
    semi = text.rfind(";")
    if eq < 0 or semi <= eq:
        raise AssertionError(f"Invalid JS assignment: {path}")
    return json.loads(text[eq + 1:semi])

def clean(text):
    return re.sub(r"<[^>]*>", "", str(text or "")).strip()

def fail_if(condition, message):
    if condition:
        raise AssertionError(message)

def main():
    source_words = []
    for i in range(1, 7):
        source_words.extend(parse_js(DATA / f"n1-extra-words-openjlpt-{i}.js"))

    fail_if(len(source_words) != 2933, f"OpenJLPT word count: {len(source_words)} != 2933")
    ids = [x["id"] for x in source_words]
    fail_if(len(set(ids)) != 2933, "Duplicate OpenJLPT IDs found")
    id_set = set(ids)

    overrides = parse_js(DATA / "n1-curated-overrides.js")
    fail_if(set(overrides) != id_set,
            f"Override ID coverage mismatch: overrides={len(overrides)} source={len(id_set)}")

    first_examples = {}
    for x in source_words:
        oid = x["id"]
        o = overrides[oid]
        meaning = str(o.get("meaning") or "").strip()
        fail_if(not meaning, f"Missing meaning: {oid}")
        fail_if(BAD_TEXT.search(meaning), f"Garbled meaning: {oid}: {meaning}")

        examples = o.get("examples")
        fail_if(not isinstance(examples, list) or not examples, f"Missing reviewed example: {oid}")
        ex = examples[0]
        fail_if(not isinstance(ex, dict), f"Invalid reviewed example object: {oid}")
        jp = str(ex.get("jp") or "").strip()
        ko = str(ex.get("ko") or "").strip()
        fail_if(not jp or not ko, f"Incomplete reviewed example: {oid}")
        fail_if(BAD_TEXT.search(jp + ko), f"Garbled reviewed example: {oid}")
        first_examples[oid] = clean(jp)

    seconds = {}
    for i in range(1, 31):
        bank = parse_js(DATA / f"n1-second-examples-{i}.js")
        for oid, ex in bank.items():
            fail_if(oid in seconds, f"Duplicate second-example ID: {oid}")
            seconds[oid] = ex

    fail_if(set(seconds) != id_set,
            f"Second-example coverage mismatch: second={len(seconds)} source={len(id_set)}")

    duplicate_pairs = []
    for oid in ids:
        ex = seconds[oid]
        jp = str(ex.get("jp") or "").strip()
        ko = str(ex.get("ko") or "").strip()
        fail_if(not jp or not ko, f"Incomplete second example: {oid}")
        fail_if(BAD_TEXT.search(jp + ko), f"Garbled second example: {oid}")
        if clean(jp) == first_examples[oid]:
            duplicate_pairs.append(oid)
    fail_if(duplicate_pairs, "Identical example 1/2: " + ", ".join(duplicate_pairs[:20]))

    breakdowns = {}
    required = ("type", "parts", "core", "memory", "formation", "nuance", "tip")
    for i in range(1, 67):
        bank = parse_js(DATA / f"n1-word-breakdowns-{i}.js")
        for oid, item in bank.items():
            fail_if(oid in breakdowns, f"Duplicate breakdown ID: {oid}")
            breakdowns[oid] = item
            for key in required:
                value = item.get(key)
                fail_if(value in (None, "", []), f"Missing breakdown {key}: {oid}")
            fail_if(not isinstance(item.get("parts"), list), f"Invalid breakdown parts: {oid}")

    fail_if(set(breakdowns) != id_set,
            f"Breakdown coverage mismatch: breakdowns={len(breakdowns)} source={len(id_set)}")

    furi_source_path = DATA / "n1-word-furigana-source.json"
    if furi_source_path.exists():
        furi_source = json.loads(furi_source_path.read_text(encoding="utf-8"))
        count = int(furi_source.get("count") or 0)
        words = furi_source.get("words") or []
        fail_if(count != len(words), f"Furigana source count mismatch: {count} vs {len(words)}")
        fail_if(count < 3233, f"Furigana source unexpectedly small: {count}")

    furi_output = DATA / "n1-word-furigana.js"
    if furi_output.exists() and furi_output.stat().st_size:
        text = furi_output.read_text(encoding="utf-8")
        prefix = "window.N1_WORD_FURIGANA="
        fail_if(not text.startswith(prefix), "Invalid furigana output assignment")
        payload = text[len(prefix):].strip()
        fail_if(not payload.endswith(";"), "Invalid furigana output terminator")
        bank = json.loads(payload[:-1])
        fail_if(len(bank) < 3233, f"Furigana output too small: {len(bank)}")

    print("N1 word QA passed")
    print(f"  OpenJLPT words: {len(source_words)}")
    print(f"  Reviewed meanings/examples: {len(overrides)}")
    print(f"  Second examples: {len(seconds)}")
    print(f"  Breakdown entries: {len(breakdowns)}")
    print("  Identical example pairs: 0")
    print("  Garbled/missing required fields: 0")

if __name__ == "__main__":
    main()
