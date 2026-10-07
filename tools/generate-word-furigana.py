import html
import json
import re
from pathlib import Path

from sudachipy import dictionary, tokenizer as sudachi_tokenizer

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "n1-word-furigana-source.json"
OUT = ROOT / "data" / "n1-word-furigana.js"

KANJI_RE = re.compile(r"[一-龯々〆ヵヶ]")
KANA_RE = re.compile(r"[ぁ-ゖァ-ヺー]")

tokenizer = dictionary.Dictionary().create()
SPLIT_MODE = sudachi_tokenizer.Tokenizer.SplitMode.C

def kata_to_hira(s):
    out=[]
    for ch in s:
        code=ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code-0x60))
        else:
            out.append(ch)
    return "".join(out)

def reading_of(tok):
    val=tok.reading_form()
    if val and val!="*":
        return kata_to_hira(str(val))
    return None

def wrap_surface(surface,reading):
    if not KANJI_RE.search(surface):
        return html.escape(surface)
    if not reading:
        raise RuntimeError(f"No dictionary reading for kanji token: {surface}")

    start=0
    end_s=len(surface)
    end_r=len(reading)

    while start<end_s and start<end_r and surface[start]==reading[start] and KANA_RE.match(surface[start]):
        start+=1
    while end_s>start and end_r>start and surface[end_s-1]==reading[end_r-1] and KANA_RE.match(surface[end_s-1]):
        end_s-=1
        end_r-=1

    head=surface[:start]
    base=surface[start:end_s]
    rd=reading[start:end_r]
    tail=surface[end_s:]

    if not base or not rd or not KANJI_RE.search(base):
        return f'<span class="furi" data-r="{html.escape(reading,quote=True)}">{html.escape(surface)}</span>'

    return (
        html.escape(head)
        + f'<span class="furi" data-r="{html.escape(rd,quote=True)}">'
        + html.escape(base)
        + "</span>"
        + html.escape(tail)
    )

def annotate(text):
    text=str(text or "")
    out=[]
    for part in re.split(r"(\s+)",text):
        if not part:
            continue
        if part.isspace():
            out.append(part)
            continue
        for tok in tokenizer.tokenize(part,SPLIT_MODE):
            out.append(wrap_surface(tok.surface(),reading_of(tok)))

    rendered="".join(out)
    outside=re.sub(r'<span class="furi" data-r="[^"]*">.*?</span>',"",rendered)
    leftover=KANJI_RE.findall(re.sub(r"<[^>]+>","",outside))
    if leftover:
        raise RuntimeError(f"Unannotated kanji remain: {''.join(leftover[:20])} in {text[:100]}")
    return rendered

data=json.loads(SOURCE.read_text(encoding="utf-8"))
result={}
example_count=0
related_count=0

for i,w in enumerate(data["words"],1):
    examples=[annotate(x) for x in w.get("examples",[])]
    related=[annotate(x) for x in w.get("related",[])]
    if examples or related:
        result[w["id"]]={"examples":examples,"related":related}
    example_count+=len(examples)
    related_count+=len(related)
    if i%250==0:
        print(f"[{i:04d}/{len(data['words'])}] word furigana")

OUT.write_text(
    "window.N1_WORD_FURIGANA="
    +json.dumps(result,ensure_ascii=False,separators=(",",":"))
    +";\n",
    encoding="utf-8",
)
print(f"Done: {len(result)} words, {example_count} examples, {related_count} related entries; complete kanji coverage.")
