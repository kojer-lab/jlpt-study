#!/usr/bin/env python3
"""Generate the next complete 500-word language-review packet, sorted by risk."""
import argparse
import html
import json
import re
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TOTAL = 2933
JP = re.compile(r"[ぁ-ゖァ-ヺ一-龯々]")
KO = re.compile(r"[가-힣]")
KANJI = re.compile(r"[一-龯々]")
BAD = re.compile(r"[�□■]|\?{3,}")
ENG = re.compile(r"[A-Za-z]{5,}")
PUNCT = re.compile(r"[\s、。！？!?,.「」『』（）()：:;；]")
TAGS = re.compile(r"<[^>]*>")
GLOSS_HINTS = ("버젓", "따리", "탬퍼", "명부", "제언", "갤럽", "결삭", "승인필", "도취 / 객차")

def parse(path):
    s = path.read_text(encoding="utf-8")
    a, b = s.find("="), s.rfind(";")
    if a < 0 or b <= a:
        raise ValueError(f"Invalid JS assignment: {path}")
    return json.loads(s[a+1:b])

def plain(x):
    return html.unescape(TAGS.sub("", str(x or ""))).strip()

def norm(x):
    return PUNCT.sub("", plain(x))

def mentions(jp, word):
    jp, word = plain(jp), plain(word)
    if len(word) == 1 and KANJI.fullmatch(word):
        return bool(re.search(r"(?<![一-龯々])" + re.escape(word) + r"(?![一-龯々])", jp))
    if word in jp:
        return True
    if len(word) >= 3 and re.search(r"[ぁ-ゖ]$", word) and KANJI.search(word):
        return word[:-1] in jp
    return False

def score_word(w, override, first, second):
    flags = []
    def add(code, weight, reason):
        flags.append({"code": code, "weight": weight, "reason": reason})
    word = plain(w.get("w"))
    meaning = plain(override.get("meaning") or w.get("meaning"))
    j1, j2 = plain(first.get("jp")), plain(second.get("jp"))
    k1, k2 = plain(first.get("ko")), plain(second.get("ko"))
    if not KO.search(meaning): add("meaning_no_korean", 6, "뜻의 한글 누락")
    if not KO.search(k1) or not KO.search(k2): add("translation_no_korean", 5, "예문 번역의 한글 누락")
    if not JP.search(j1) or not JP.search(j2): add("japanese_missing", 5, "일본어 예문 누락")
    if BAD.search(meaning+j1+j2+k1+k2): add("broken_chars", 6, "깨진 문자")
    if not plain(w.get("r")): add("reading_missing", 5, "읽기 누락")
    if ENG.search(meaning): add("english_meaning", 2, "뜻의 영어 문구 확인")
    if ENG.search(k1+" "+k2): add("english_translation", 1, "번역의 영문 문구 확인")
    if any(h in meaning for h in GLOSS_HINTS): add("suspicious_gloss", 3, "과거 오역과 유사한 번역")
    if max(len(j1),len(j2)) > 90: add("long_example", 1, "긴 예문 문맥 재검토")
    if not mentions(j1,word): add("first_headword_not_found", 3, "첫 예문의 표제어 용법 확인")
    if not mentions(j2,word): add("second_headword_not_found", 3, "둘째 예문의 표제어 용법 확인")
    a,b=norm(j1),norm(j2)
    if a and b:
        if a==b or (min(len(a),len(b))>=8 and (a in b or b in a)):
            add("duplicate_examples",6,"두 예문이 동일 또는 포함 관계")
        elif min(len(a),len(b))>=10:
            similarity=SequenceMatcher(None,a,b).ratio()
            if similarity>=0.70: add("similar_examples",3,f"예문 {similarity:.0%} 유사; 상황 중복 여부 확인")
    if first.get("exampleSource")=="Argos-fallback":
        add("machine_translated",2,"자동번역 출처의 예문")
    total=sum(f["weight"] for f in flags)
    risk="high" if total>=5 else ("medium" if total>=2 else "normal")
    return flags,total,risk

def packet(start=None, batch=500):
    if not 1<=batch<=TOTAL: raise ValueError("Invalid batch size")
    progress=json.loads((DATA/"n1-language-review-progress.json").read_text(encoding="utf-8"))
    last=int(progress["reviewedRange"][1])
    start=(last+1) if start is None else start
    if last == TOTAL and start == TOTAL+1:
        reviewed_ids = progress.get("reviewedWordIds") or []
        if len(reviewed_ids) != TOTAL or len(set(reviewed_ids)) != TOTAL:
            raise ValueError("Completed review has missing or duplicate word IDs")
        return {
            "status": "complete",
            "notice": "All 2,933 N1 vocabulary entries have been reviewed; no further batch remains.",
            "range": None,
            "reviewed_before_packet": last,
            "total": 0,
            "risk_counts": {"high": 0, "medium": 0, "normal": 0},
            "ranked_ids": [],
            "entries": [],
        }
    if not 1<=start<=TOTAL: raise ValueError(f"All batches complete or invalid start: {start}")
    end=min(start+batch-1,TOTAL)
    words=[]
    for i in range(1,7): words+=parse(DATA/f"n1-extra-words-openjlpt-{i}.js")
    overrides=parse(DATA/"n1-curated-overrides.js")
    second={}
    for i in range(1,31):
        for wid,ex in parse(DATA/f"n1-second-examples-{i}.js").items():
            if wid in second: raise ValueError(f"Duplicate second-example ID: {wid}")
            second[wid]=ex
    ids={w["id"] for w in words}
    if len(words)!=TOTAL or len(ids)!=TOTAL or ids!=set(overrides) or ids!=set(second):
        raise ValueError("2,933-word source/override/second-example coverage mismatch")
    entries=[]
    for i in range(start-1,end):
        w=words[i]
        ov=overrides[w["id"]]
        first=(ov.get("examples") or w.get("examples") or [{}])[0]
        last_example=second[w["id"]]
        if not isinstance(first,dict) or not isinstance(last_example,dict):
            raise ValueError(f"Invalid examples for {w['id']}")
        flags,priority,risk=score_word(w,ov,first,last_example)
        entries.append({
            "number":i+1,"id":w["id"],"word":plain(w.get("w")),"reading":plain(w.get("r")),
            "meaning":plain(ov.get("meaning") or w.get("meaning")),
            "first":{"jp":plain(first.get("jp")),"ko":plain(first.get("ko"))},
            "second":{"jp":plain(last_example.get("jp")),"ko":plain(last_example.get("ko"))},
            "risk":risk,"priority":priority,"flags":flags
        })
    ranked=sorted(entries,key=lambda r:(-r["priority"],r["number"]))
    output={
        "notice":"Prioritized review queue, NOT a translation accuracy certificate. EVERY entry remains in the queue.",
        "range":[start,end],"reviewed_before_packet":last,"total":len(entries),
        "risk_counts":{label:sum(e["risk"]==label for e in entries) for label in ("high","medium","normal")},
        "ranked_ids":[x["id"] for x in ranked],"entries":entries
    }
    assert len(set(output["ranked_ids"]))==len(entries)
    return output

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start",type=int,default=None)
    parser.add_argument("--batch-size",type=int,default=500)
    parser.add_argument("--out",type=Path,default=Path("qa-results/n1-language-review-next.json"))
    args=parser.parse_args()
    result=packet(args.start,args.batch_size)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Language review queue {result['range']}, {result['total']} items; risks: {result['risk_counts']}")
    print("Heuristics never certify linguistic accuracy; review ALL entries, high-priority first.")

if __name__=="__main__":
    main()
