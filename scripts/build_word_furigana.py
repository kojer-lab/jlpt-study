#!/usr/bin/env python3
import json
import re
import html
from pathlib import Path

from fugashi import Tagger

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "n1-word-furigana-source.json"
OVERRIDES = DATA / "n1-curated-overrides.js"
OUTPUT = DATA / "n1-word-furigana.js"

KANJI_RE = re.compile(r"[一-龯々〆ヵヶ]")
TAGGER = Tagger()

def parse_js_assignment(path: Path):
    text = path.read_text(encoding="utf-8")
    eq = text.find("=")
    semi = text.rfind(";")
    if eq < 0 or semi <= eq:
        return {}
    return json.loads(text[eq + 1:semi])

def kata_to_hira(text: str) -> str:
    out = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)

def token_reading(word) -> str:
    f = word.feature
    for name in ("kana", "pron", "kanaBase", "pronBase"):
        value = getattr(f, name, None)
        if value and value != "*":
            return kata_to_hira(str(value))
    return kata_to_hira(str(word.surface))

def char_kind(ch: str) -> str:
    if KANJI_RE.search(ch):
        return "kanji"
    return "other"

def runs(surface: str):
    if not surface:
        return []
    out = []
    cur_kind = char_kind(surface[0])
    cur = [surface[0]]
    for ch in surface[1:]:
        k = char_kind(ch)
        if k == cur_kind:
            cur.append(ch)
        else:
            out.append((cur_kind, "".join(cur)))
            cur_kind = k
            cur = [ch]
    out.append((cur_kind, "".join(cur)))
    return out

def mixed_token_html(surface: str, reading: str) -> str:
    """Attach readings only to kanji runs, leaving okurigana/kana untouched."""
    if not KANJI_RE.search(surface):
        return html.escape(surface)

    rs = runs(surface)
    reading = kata_to_hira(reading)
    pos = 0
    pieces = []

    for i, (kind, text) in enumerate(rs):
        if kind != "kanji":
            pieces.append(html.escape(text))
            anchor = kata_to_hira(text)
            if anchor and reading.startswith(anchor, pos):
                pos += len(anchor)
            else:
                found = reading.find(anchor, pos) if anchor else -1
                if found >= 0:
                    pos = found + len(anchor)
            continue

        # Reading for this kanji run ends where the next kana/non-kanji run begins.
        next_anchor = ""
        for k2, t2 in rs[i + 1:]:
            if k2 != "kanji":
                next_anchor = kata_to_hira(t2)
                break

        if next_anchor:
            found = reading.find(next_anchor, pos)
            rd = reading[pos:found] if found >= pos else ""
        else:
            rd = reading[pos:]

        if not rd:
            # Conservative fallback: whole token reading is still better than a wrong empty ruby.
            rd = reading

        pieces.append(
            '<span class="furi" data-r="' + html.escape(rd, quote=True) + '">' +
            html.escape(text) + "</span>"
        )
        pos += len(rd)

    return "".join(pieces)

def furigana_html(text: str) -> str:
    text = str(text or "")
    if not KANJI_RE.search(text):
        return html.escape(text)

    out = []
    for word in TAGGER(text):
        surface = str(word.surface)
        if not KANJI_RE.search(surface):
            out.append(html.escape(surface))
            continue
        out.append(mixed_token_html(surface, token_reading(word)))
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

    # Keep the app contract: at most two example slots.
    return base[:2]

def main():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    overrides = parse_js_assignment(OVERRIDES)

    second_examples = {}
    for path in sorted(DATA.glob("n1-second-examples-*.js")):
        second_examples.update(parse_js_assignment(path))

    bank = {}
    missing_examples = []
    for item in source.get("words", []):
        item_id = item.get("id")
        if not item_id:
            continue

        examples = final_examples(item, overrides, second_examples)
        if len(examples) < 2:
            missing_examples.append(item_id)

        related = [str(x) for x in item.get("related", []) if str(x).strip()]
        bank[item_id] = {
            "examples": [furigana_html(x) for x in examples],
            "related": [furigana_html(x) for x in related],
        }

    expected = int(source.get("count") or len(source.get("words", [])))
    if len(bank) != expected:
        raise SystemExit(f"furigana count mismatch: built={len(bank)} expected={expected}")

    # OpenJLPT entries are expected to have two examples after QA completion.
    openjlpt_missing = [x for x in missing_examples if x.startswith("oj-")]
    if openjlpt_missing:
        raise SystemExit("OpenJLPT entries missing second example: " + ", ".join(openjlpt_missing[:20]))

    payload = "window.N1_WORD_FURIGANA=" + json.dumps(
        bank, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    OUTPUT.write_text(payload, encoding="utf-8")
    print(f"Built {len(bank)} furigana entries -> {OUTPUT}")
    print(f"Output bytes: {OUTPUT.stat().st_size}")

if __name__ == "__main__":
    main()
