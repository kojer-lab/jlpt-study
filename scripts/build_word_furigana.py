#!/usr/bin/env python3
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
INDEX = ROOT / "index.html"
SOURCE = DATA / "n1-word-furigana-source.json"
OVERRIDES = DATA / "n1-curated-overrides.js"
OUTPUT = DATA / "n1-word-furigana.js"

KANJI_RE = re.compile(r"[一-龯々〆ヵヶ]")
F_RE = re.compile(r'''F\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)''')
BASE_ID_RE = re.compile(r'''\{\s*id:["']([^"']+)["']\s*,\s*w:F\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)''')

def parse_js_assignment(path: Path):
    text = path.read_text(encoding="utf-8")
    eq = text.find("=")
    semi = text.rfind(";")
    if eq < 0 or semi <= eq:
        return {}
    return json.loads(text[eq + 1:semi])

def kata_to_hira(text: str) -> str:
    out = []
    for ch in str(text or ""):
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)

def char_kind(ch: str) -> str:
    return "kanji" if KANJI_RE.search(ch) else "other"

def runs(surface: str):
    if not surface:
        return []
    out = []
    kind = char_kind(surface[0])
    cur = [surface[0]]
    for ch in surface[1:]:
        k = char_kind(ch)
        if k == kind:
            cur.append(ch)
        else:
            out.append((kind, "".join(cur)))
            kind = k
            cur = [ch]
    out.append((kind, "".join(cur)))
    return out

def mixed_word_html(surface: str, reading: str) -> str:
    surface = str(surface or "")
    reading = kata_to_hira(reading)
    if not KANJI_RE.search(surface):
        return html.escape(surface)

    parts = runs(surface)
    pos = 0
    out = []
    for i, (kind, text) in enumerate(parts):
        if kind != "kanji":
            out.append(html.escape(text))
            anchor = kata_to_hira(text)
            if anchor and reading.startswith(anchor, pos):
                pos += len(anchor)
            else:
                found = reading.find(anchor, pos) if anchor else -1
                if found >= 0:
                    pos = found + len(anchor)
            continue

        next_anchor = ""
        for k2, t2 in parts[i + 1:]:
            if k2 != "kanji":
                next_anchor = kata_to_hira(t2)
                break

        if next_anchor:
            found = reading.find(next_anchor, pos)
            rd = reading[pos:found] if found >= pos else ""
        else:
            rd = reading[pos:]

        if not rd:
            rd = reading

        out.append(
            '<span class="furi" data-r="' + html.escape(rd, quote=True) + '">' +
            html.escape(text) + "</span>"
        )
        pos += len(rd)
    return "".join(out)

def build_word_maps():
    index_text = INDEX.read_text(encoding="utf-8")

    id_map = {}
    reading_candidates = {}

    def add_word(item_id, surface, reading):
        surface = str(surface or "").strip()
        reading = str(reading or "").strip()
        if not surface or not reading:
            return
        if item_id:
            id_map[item_id] = (surface, reading)
        reading_candidates.setdefault(surface, set()).add(reading)

    # The original hand-curated N1 bank lives inline in index.html.
    for m in BASE_ID_RE.finditer(index_text):
        add_word(m.group(1), m.group(2), m.group(3))

    # F(...) calls throughout the app provide a large, trusted reading lexicon.
    for m in F_RE.finditer(index_text):
        add_word(None, m.group(1), m.group(2))

    # All external word banks are JSON-like JS assignments.
    paths = [
        DATA / "n1-extra-words-1.js",
        DATA / "n1-extra-words-2.js",
        DATA / "n1-extra-words-3.js",
        *[DATA / f"n1-extra-words-openjlpt-{i}.js" for i in range(1, 7)],
    ]
    for path in paths:
        if not path.exists():
            continue
        bank = parse_js_assignment(path)
        if not isinstance(bank, list):
            continue
        for x in bank:
            if not isinstance(x, dict):
                continue
            add_word(x.get("id"), x.get("w"), x.get("r"))

    # Use only unambiguous general readings. Ambiguous single-kanji readings are
    # still allowed when the current headword itself is that entry.
    lexicon = {}
    for surface, readings in reading_candidates.items():
        if len(readings) == 1:
            lexicon[surface] = next(iter(readings))

    by_first = {}
    for surface, reading in lexicon.items():
        if not KANJI_RE.search(surface):
            continue
        if len(surface) < 2:
            continue
        by_first.setdefault(surface[0], []).append((surface, reading))
    for arr in by_first.values():
        arr.sort(key=lambda x: len(x[0]), reverse=True)

    return id_map, by_first

def enrich_text(text: str, item_id: str, id_map, by_first) -> str:
    text = str(text or "")
    if not KANJI_RE.search(text):
        return html.escape(text)

    specials = []
    current = id_map.get(item_id)
    if current:
        surface, reading = current
        if surface and reading and KANJI_RE.search(surface):
            specials.append((surface, reading))
    specials.sort(key=lambda x: len(x[0]), reverse=True)

    out = []
    i = 0
    while i < len(text):
        hit = None

        for surface, reading in specials:
            if text.startswith(surface, i):
                hit = (surface, reading)
                break

        if hit is None:
            for surface, reading in by_first.get(text[i], []):
                if text.startswith(surface, i):
                    hit = (surface, reading)
                    break

        if hit is not None:
            surface, reading = hit
            out.append(mixed_word_html(surface, reading))
            i += len(surface)
            continue

        out.append(html.escape(text[i]))
        i += 1

    return "".join(out)

def final_examples(source_item, overrides, second_examples):
    item_id = source_item.get("id", "")
    base = [str(x) for x in source_item.get("examples", []) if str(x).strip()]
    override = overrides.get(item_id) or {}

    if isinstance(override.get("examples"), list):
        base = []
        for ex in override["examples"]:
            jp = ex.get("jp", "") if isinstance(ex, dict) else ""
            if str(jp).strip():
                base.append(str(jp))

    if len(base) < 2:
        ex2 = second_examples.get(item_id)
        if isinstance(ex2, dict):
            jp = str(ex2.get("jp", "")).strip()
            if jp and jp not in base:
                base.append(jp)

    return base[:2]

def main():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    overrides = parse_js_assignment(OVERRIDES)

    second_examples = {}
    for path in sorted(DATA.glob("n1-second-examples-*.js")):
        second_examples.update(parse_js_assignment(path))

    id_map, by_first = build_word_maps()

    words = source.get("words", [])
    expected = int(source.get("count") or len(words))

    missing_word_meta = [x.get("id") for x in words if x.get("id") not in id_map]
    if missing_word_meta:
        raise SystemExit(
            "Missing surface/reading metadata: " + ", ".join(missing_word_meta[:20])
        )

    bank = {}
    missing_examples = []
    for item in words:
        item_id = item.get("id")
        if not item_id:
            continue

        examples = final_examples(item, overrides, second_examples)
        if len(examples) < 2:
            missing_examples.append(item_id)

        related = [str(x) for x in item.get("related", []) if str(x).strip()]
        bank[item_id] = {
            "examples": [enrich_text(x, item_id, id_map, by_first) for x in examples],
            "related": [enrich_text(x, item_id, id_map, by_first) for x in related],
        }

    if len(bank) != expected:
        raise SystemExit(f"furigana count mismatch: built={len(bank)} expected={expected}")

    openjlpt_missing = [x for x in missing_examples if str(x).startswith("oj-")]
    if openjlpt_missing:
        raise SystemExit(
            "OpenJLPT entries missing second example: " + ", ".join(openjlpt_missing[:20])
        )

    payload = "window.N1_WORD_FURIGANA=" + json.dumps(
        bank, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    OUTPUT.write_text(payload, encoding="utf-8")

    furi_count = payload.count('class=\\\"furi\\\"')
    if furi_count == 0:
        raise SystemExit("furigana output contains no ruby spans")

    print(f"Built {len(bank)} furigana entries -> {OUTPUT}")
    print(f"Furigana spans: {furi_count}")
    print(f"Output bytes: {OUTPUT.stat().st_size}")

if __name__ == "__main__":
    main()
