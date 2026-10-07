#!/usr/bin/env python3
import json
import re
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OPENJLPT_URL = "https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/n1.json"
TATOEBA_API = "https://api.tatoeba.org/v1/sentences"
CHUNK_RE = re.compile(r"n1-extra-words-openjlpt-(\d+)\.js$")

_tls = threading.local()

def session():
    if not hasattr(_tls, "session"):
        s = requests.Session()
        s.headers.update({"User-Agent": "kojer-jlpt-study-tatoeba-refiner/1.0"})
        _tls.session = s
    return _tls.session

def request_json(url, params=None, timeout=40):
    last = None
    for attempt in range(5):
        try:
            r = session().get(url, params=params, timeout=timeout)
            if r.status_code == 429:
                delay = min(30, int(r.headers.get("Retry-After", "3") or 3))
                time.sleep(delay)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last = e
            time.sleep(1.5 * (attempt + 1))
    return None

def fetch_json(url):
    r = requests.get(url, headers={"User-Agent": "kojer-jlpt-study-tatoeba-refiner/1.0"}, timeout=120)
    r.raise_for_status()
    return r.json()

def load_js_array(path):
    text = path.read_text(encoding="utf-8")
    eq = text.find("=")
    if eq < 0:
        raise ValueError(f"no assignment in {path}")
    return json.loads(re.sub(r";\s*$", "", text[eq + 1 :].strip()))

def dump_js_array(path, var_name, rows):
    path.write_text(
        f"window.{var_name}=" + json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

def normalize(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

def furi_html(s):
    if not s:
        return ""
    return re.sub(
        r"\{([^{}|]+)\|([^{}]+)\}",
        lambda m: f'<span class="furi" data-r="{m.group(2)}">{m.group(1)}</span>',
        s,
    )

def choose_openjlpt_example(src):
    good = [
        x for x in (src.get("examples") or [])
        if normalize(x.get("ja")) and x.get("tatoeba_id")
    ]
    if not good:
        return None
    return sorted(good, key=lambda x: (len(normalize(x.get("ja"))), normalize(x.get("ja"))))[0]

def walk_lang_texts(obj, lang):
    out = []
    def walk(x, inherited_direct=None):
        if isinstance(x, dict):
            here_direct = x.get("is_direct", inherited_direct)
            if x.get("lang") == lang and normalize(x.get("text")):
                score = 0 if here_direct is True else 1
                out.append((score, normalize(x.get("text"))))
            for v in x.values():
                walk(v, here_direct)
        elif isinstance(x, list):
            for v in x:
                walk(v, inherited_direct)
    walk(obj)
    seen = set()
    vals = []
    for score, text in sorted(out, key=lambda z: z[0]):
        if text not in seen:
            seen.add(text)
            vals.append(text)
    return vals

def find_jpn_kor_pairs(obj, target_word):
    pairs = []
    def walk(x):
        if isinstance(x, dict):
            if x.get("lang") == "jpn" and normalize(x.get("text")):
                ja = normalize(x.get("text"))
                kos = walk_lang_texts(x, "kor")
                if kos and (not target_word or target_word in ja):
                    pairs.append((len(ja), ja, kos[0], x.get("id")))
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(obj)
    pairs.sort(key=lambda x: x[0])
    return pairs

def fetch_korean_for_id(sentence_id):
    payload = request_json(f"{TATOEBA_API}/{sentence_id}", params={"showtrans": "all"})
    if not payload:
        return sentence_id, ""
    vals = walk_lang_texts(payload, "kor")
    return sentence_id, (vals[0] if vals else "")

def search_korean_example(word):
    params = {
        "lang": "jpn",
        "q": word,
        "trans:lang": "kor",
        "showtrans:lang": "kor",
        "sort": "words",
    }
    payload = request_json(TATOEBA_API, params=params)
    if not payload:
        return word, None
    pairs = find_jpn_kor_pairs(payload, word)
    if not pairs:
        return word, None
    _, ja, ko, sid = pairs[0]
    return word, {"ja": ja, "ko": ko, "tatoeba_id": sid}

def main():
    source = fetch_json(OPENJLPT_URL)
    by_id = {x["id"]: x for x in source}

    files = sorted(
        [p for p in DATA.glob("n1-extra-words-openjlpt-*.js") if CHUNK_RE.search(p.name)],
        key=lambda p: int(CHUNK_RE.search(p.name).group(1)),
    )
    rows_by_file = {}
    all_rows = []
    for i, path in enumerate(files, 1):
        rows = load_js_array(path)
        rows_by_file[i] = rows
        for row in rows:
            src_id = str(row.get("id", ""))
            if src_id.startswith("oj-"):
                src_id = src_id[3:]
            src = by_id.get(src_id)
            all_rows.append((i, row, src))

    # Phase 1: exact Tatoeba translations for the OpenJLPT example already selected.
    row_info = {}
    exact_ids = set()
    for i, row, src in all_rows:
        if not src:
            continue
        ex = choose_openjlpt_example(src)
        if ex and ex.get("tatoeba_id"):
            sid = int(ex["tatoeba_id"])
            row_info[row["id"]] = (ex, sid)
            exact_ids.add(sid)

    print(f"Checking {len(exact_ids)} Tatoeba sentence IDs for native Korean translations...")
    exact_ko = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [pool.submit(fetch_korean_for_id, sid) for sid in sorted(exact_ids)]
        for n, fut in enumerate(as_completed(futs), 1):
            sid, ko = fut.result()
            exact_ko[sid] = ko
            if n % 200 == 0:
                print(f"  exact {n}/{len(futs)}")

    native_exact = 0
    needs_search = []
    for i, row, src in all_rows:
        info = row_info.get(row.get("id"))
        if info:
            ex, sid = info
            ko = exact_ko.get(sid, "")
            if ko:
                row["examples"] = [{
                    "jp": furi_html(ex.get("furigana") or ex.get("ja") or ""),
                    "ko": ko,
                    "tatoebaId": sid,
                    "exampleSource": "Tatoeba-ko",
                }]
                native_exact += 1
                continue
        needs_search.append((row, src))

    # Phase 2: for rows without a direct Korean translation, search a short Japanese
    # example containing the headword that *does* have a Korean Tatoeba translation.
    search_words = sorted({
        normalize((src or {}).get("word") or row.get("w"))
        for row, src in needs_search
        if normalize((src or {}).get("word") or row.get("w"))
    })
    print(f"Searching Tatoeba for Korean-linked examples for {len(search_words)} headwords...")
    search_results = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [pool.submit(search_korean_example, word) for word in search_words]
        for n, fut in enumerate(as_completed(futs), 1):
            word, result = fut.result()
            search_results[word] = result
            if n % 200 == 0:
                print(f"  search {n}/{len(futs)}")

    native_search = 0
    kept_fallback = 0
    still_missing = 0
    for row, src in needs_search:
        word = normalize((src or {}).get("word") or row.get("w"))
        result = search_results.get(word)
        if result:
            row["examples"] = [{
                "jp": result["ja"],
                "ko": result["ko"],
                "tatoebaId": result.get("tatoeba_id"),
                "exampleSource": "Tatoeba-ko-search",
            }]
            native_search += 1
        elif row.get("examples"):
            for ex in row["examples"]:
                ex.setdefault("exampleSource", "Argos-fallback")
            kept_fallback += 1
        else:
            still_missing += 1

    for i, path in enumerate(files, 1):
        dump_js_array(path, f"N1_EXTRA_WORDS_OJ_{i}", rows_by_file[i])

    meta_path = DATA / "openjlpt-example-refinement-meta.json"
    meta = {
        "version": 1,
        "total": len(all_rows),
        "native_korean_exact": native_exact,
        "native_korean_search": native_search,
        "tatoeba_korean_total": native_exact + native_search,
        "machine_translation_fallback": kept_fallback,
        "examples_missing": still_missing,
        "checked_sentence_ids": len(exact_ids),
        "searched_headwords": len(search_words),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
