import html
import json
import re
from pathlib import Path

from sudachipy import dictionary, tokenizer as sudachi_tokenizer

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"data"/"n1-reading-furigana-source.json"
OUT=ROOT/"data"/"n1-reading-furigana.js"
KANJI_RE=re.compile(r"[一-龯々〆ヵヶ]")
TAG_RE=re.compile(r"<[^>]+>")
PARA_RE=re.compile(r"(?:<br\s*/?>\s*){2,}",re.I)

tokenizer=dictionary.Dictionary().create()\nSPLIT_MODE=sudachi_tokenizer.Tokenizer.SplitMode.C

def kata_to_hira(s):
    out=[]
    for ch in s:
        code=ord(ch)
        if 0x30A1<=code<=0x30F6:
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
    kana_re=re.compile(r"[ぁ-ゖァ-ヺー]")
    start=0
    end_s=len(surface)
    end_r=len(reading)
    while start<end_s and start<end_r and surface[start]==reading[start] and kana_re.match(surface[start]):
        start+=1
    while end_s>start and end_r>start and surface[end_s-1]==reading[end_r-1] and kana_re.match(surface[end_s-1]):
        end_s-=1
        end_r-=1
    head=surface[:start]
    base=surface[start:end_s]
    rd=reading[start:end_r]
    tail=surface[end_s:]
    if not base or not rd or not KANJI_RE.search(base):
        return f'<span class="furi" data-r="{html.escape(reading,quote=True)}">{html.escape(surface)}</span>'
    return html.escape(head)+f'<span class="furi" data-r="{html.escape(rd,quote=True)}">{html.escape(base)}</span>'+html.escape(tail)

def annotate_plain(text):
    out=[]
    for tok in tokenizer.tokenize(text,SPLIT_MODE):
        out.append(wrap_surface(tok.surface(),reading_of(tok)))
    return "".join(out)

def annotate(raw):
    raw=str(raw or "")
    raw=PARA_RE.sub("\n\n",raw)
    raw=TAG_RE.sub("",raw)
    chunks=raw.split("\n\n")
    rendered="<br><br>".join(annotate_plain(x) for x in chunks)
    # Every kanji in the rendered output must live inside a furigana span.
    outside=re.sub(r'<span class="furi" data-r="[^"]*">.*?</span>',"",rendered)
    leftover=KANJI_RE.findall(TAG_RE.sub("",outside))
    if leftover:
        raise RuntimeError(f"Unannotated kanji remain: {''.join(leftover[:20])} in {raw[:80]}")
    return rendered

data=json.loads(SOURCE.read_text(encoding="utf-8"))
result={}
for n,set_ in enumerate(data["sets"],1):
    qs=[]
    for q in set_.get("questions",[]):
        qs.append({
            "q":annotate(q.get("q","")),
            "c":[annotate(x) for x in q.get("c",[])],
            "e":annotate(q.get("e","")),
        })
    result[set_["title"]]={
        "passage":annotate(set_.get("passage","")),
        "questions":qs,
    }
    print(f"[{n:02d}/{len(data['sets'])}] {set_['title']}")

OUT.write_text("window.N1_READING_FURIGANA="+json.dumps(result,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
print(f"Done: {len(result)} reading sets, complete kanji coverage.")
