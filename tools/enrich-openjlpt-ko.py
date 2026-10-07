#!/usr/bin/env python3
import json
import os
import re
import sys
import time
from pathlib import Path
from collections import defaultdict

import requests
import ctranslate2
import argostranslate.package
import argostranslate.translate

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

OPENJLPT_URL = "https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/n1.json"
KAIKKI_URL = "https://kaikki.org/kowiktionary/%EC%9D%BC%EB%B3%B8%EC%96%B4/kaikki.org-dictionary-%EC%9D%BC%EB%B3%B8%EC%96%B4.jsonl"
ENKO_URL = "https://raw.githubusercontent.com/jhseo1211/open-english-korean-dict/main/dict/words.json"
ARGOS_EN_KO_URL = "https://argos-net.com/v1/translate-en_ko-1_1.argosmodel"
CHUNK_RE = re.compile(r"n1-extra-words-openjlpt-(\d+)\.js$")
HANGUL_RE = re.compile(r"[가-힣]")

PHRASE_KO = {
    "as usual": "평소처럼", "as ever": "여전히 / 변함없이", "in advance": "미리 / 사전에",
    "by all means": "꼭 / 부디", "at any rate": "어쨌든", "in any case": "어쨌든 / 어떤 경우에도",
    "on the contrary": "반대로", "for the time being": "당분간", "once again": "다시 한번",
    "in the meantime": "그동안 / 한편", "after all": "결국 / 역시", "in other words": "다시 말해",
    "more or less": "대체로 / 어느 정도", "sooner or later": "조만간", "little by little": "조금씩",
    "one after another": "잇따라 / 차례차례", "without fail": "반드시",
    "not necessarily": "반드시 ~인 것은 아니다", "to take into account": "고려하다",
    "to take into consideration": "고려하다", "to make use of": "활용하다",
    "to get rid of": "없애다 / 제거하다", "to deal with": "다루다 / 대응하다",
    "to be concerned about": "우려하다 / 걱정하다", "to bring about": "초래하다 / 일으키다",
    "to point out": "지적하다", "to carry out": "수행하다 / 실행하다",
    "to make up for": "보충하다 / 만회하다", "to look back on": "돌이켜보다",
    "to look into": "조사하다 / 살펴보다", "to put off": "미루다 / 연기하다",
    "to turn down": "거절하다 / 낮추다", "to set aside": "따로 두다 / 제쳐두다",
    "to come up with": "생각해내다 / 제시하다", "to be based on": "~에 근거하다",
    "to be due to": "~때문이다", "to be likely to": "~할 가능성이 높다",
    "to be supposed to": "~하기로 되어 있다", "to be capable of": "~할 수 있다",
    "civility": "예의 / 공손함", "courtesy": "예의 / 정중함", "mental arithmetic": "암산",
    "running away from home": "가출", "to get angry": "화를 내다", "to be impatient": "초조해하다",
    "to make a mistake": "실수하다 / 잘못하다", "oil painting": "유화", "rain gear": "우비 / 우구",
    "to place an order": "주문하다", "to give an order": "주문하다 / 지시하다",
    "to reveal": "밝히다 / 드러내다", "to divulge": "누설하다 / 밝히다",
}

def fetch_bytes(url, timeout=180):
    headers = {"User-Agent": "jlpt-study-data-builder/1.2"}
    last = None
    for attempt in range(4):
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            r.raise_for_status()
            return r.content
        except Exception as e:
            last = e
            print(f"download retry {attempt+1}/4: {url}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"failed to download {url}: {last}")

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

def normalize_space(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

def clean_ko(s):
    s = normalize_space(s)
    s = re.sub(r"^[\-•·]+\s*", "", s)
    s = s.replace(" 입니다.", "이다.").replace(" 합니다.", "한다.")
    return s

def normalize_en_gloss(s):
    s = normalize_space(s).lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\[[^]]*\]", " ", s)
    s = re.sub(r"[!?]", "", s)
    return normalize_space(s)

def enko_lookup(enko, raw):
    s = normalize_en_gloss(raw)
    if not s:
        return ""
    if s in PHRASE_KO:
        return PHRASE_KO[s]
    candidates = [s]
    for prefix in ("to ", "a ", "an ", "the "):
        if s.startswith(prefix):
            candidates.append(s[len(prefix):])
    for c in candidates:
        row = enko.get(c)
        if isinstance(row, dict):
            ko = clean_ko(row.get("meaning_ko", ""))
            if ko:
                return ko
        if c.endswith("ies") and len(c) > 4:
            row = enko.get(c[:-3] + "y")
            if isinstance(row, dict):
                ko = clean_ko(row.get("meaning_ko", ""))
                if ko:
                    return ko
        for suffix in ("es", "s", "ing", "ed"):
            if c.endswith(suffix) and len(c) > len(suffix) + 2:
                row = enko.get(c[:-len(suffix)])
                if isinstance(row, dict):
                    ko = clean_ko(row.get("meaning_ko", ""))
                    if ko:
                        return ko
    return ""

def install_argos_en_ko():
    model_path = ROOT / ".tmp-en-ko.argosmodel"
    installed = argostranslate.translate.get_installed_languages()
    en = next((x for x in installed if x.code == "en"), None)
    ko = next((x for x in installed if x.code == "ko"), None)
    if en and ko and en.get_translation(ko):
        return
    print("Downloading Argos en→ko model...")
    model_path.write_bytes(fetch_bytes(ARGOS_EN_KO_URL, timeout=300))
    argostranslate.package.install_from_path(model_path)
    model_path.unlink(missing_ok=True)

def get_package_translation():
    install_argos_en_ko()
    installed = argostranslate.translate.get_installed_languages()
    en = next(x for x in installed if x.code == "en")
    ko = next(x for x in installed if x.code == "ko")
    cached = en.get_translation(ko)
    underlying = getattr(cached, "underlying", cached)
    pkg = getattr(underlying, "pkg", None)
    if pkg is None:
        raise RuntimeError("Could not access installed Argos package")
    return cached, pkg

def batch_translate(texts):
    unique = []
    seen = set()
    for t in texts:
        t = normalize_space(t)
        if t and t not in seen:
            unique.append(t)
            seen.add(t)
    if not unique:
        return {}

    cached, pkg = get_package_translation()
    result_map = {}
    print(f"Batch-translating {len(unique)} unique EN→KO strings...")

    try:
        translator = ctranslate2.Translator(
            str(pkg.package_path / "model"),
            device="cpu",
            compute_type="int8_float32",
            inter_threads=1,
            intra_threads=max(2, min(4, os.cpu_count() or 2)),
        )
        chunk_size = 96
        for start in range(0, len(unique), chunk_size):
            batch = unique[start : start + chunk_size]
            tokenized = [pkg.tokenizer.encode(x) for x in batch]
            target_prefix = None
            if getattr(pkg, "target_prefix", ""):
                target_prefix = [[pkg.target_prefix]] * len(tokenized)
            translated = translator.translate_batch(
                tokenized,
                target_prefix=target_prefix,
                replace_unknowns=True,
                max_batch_size=32,
                batch_type="tokens",
                beam_size=1,
                num_hypotheses=1,
                return_scores=False,
            )
            for source_text, item in zip(batch, translated):
                tokens = item.hypotheses[0]
                out = clean_ko(pkg.tokenizer.decode(tokens))
                prefix = getattr(pkg, "target_prefix", "")
                if prefix and out.startswith(prefix):
                    out = clean_ko(out[len(prefix):])
                result_map[source_text] = out
            print(f"  MT {min(start + len(batch), len(unique))}/{len(unique)}")
        return result_map
    except Exception as e:
        print(f"Batch MT failed, using safe sequential fallback: {e}", file=sys.stderr)
        for i, text in enumerate(unique, 1):
            try:
                result_map[text] = clean_ko(cached.translate(text))
            except Exception:
                result_map[text] = ""
            if i % 100 == 0:
                print(f"  MT fallback {i}/{len(unique)}")
        return result_map

def build_kowiktionary_map():
    print("Downloading Korean Wiktionary Japanese dictionary...")
    raw = fetch_bytes(KAIKKI_URL, timeout=300).decode("utf-8")
    by_word = defaultdict(list)
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        if obj.get("lang_code") not in (None, "ja"):
            continue
        word = normalize_space(obj.get("word"))
        if not word:
            continue
        for sense in obj.get("senses") or []:
            for gloss in sense.get("glosses") or []:
                g = clean_ko(gloss)
                if g and HANGUL_RE.search(g) and g not in by_word[word]:
                    by_word[word].append(g)
    return by_word

def furi_html(s):
    if not s:
        return ""
    return re.sub(
        r"\{([^{}|]+)\|([^{}]+)\}",
        lambda m: f'<span class="furi" data-r="{m.group(2)}">{m.group(1)}</span>',
        s,
    )

def choose_example(src):
    examples = src.get("examples") or []
    good = [x for x in examples if normalize_space(x.get("ja")) and normalize_space(x.get("en"))]
    if not good:
        return None
    return sorted(good, key=lambda x: (len(normalize_space(x.get("ja"))), normalize_space(x.get("ja"))))[0]

def main():
    print("Loading OpenJLPT N1...")
    source = json.loads(fetch_bytes(OPENJLPT_URL, timeout=300).decode("utf-8"))
    source_by_id = {x["id"]: x for x in source}
    print(f"OpenJLPT N1 entries: {len(source_by_id)}")

    try:
        ko_dict = build_kowiktionary_map()
        print(f"Korean Wiktionary Japanese headwords: {len(ko_dict)}")
    except Exception as e:
        print(f"Warning: Korean Wiktionary unavailable: {e}", file=sys.stderr)
        ko_dict = {}

    print("Downloading compact English→Korean dictionary...")
    try:
        enko = json.loads(fetch_bytes(ENKO_URL, timeout=300).decode("utf-8"))
        print(f"English→Korean dictionary entries: {len(enko)}")
    except Exception as e:
        print(f"Warning: English→Korean dictionary unavailable: {e}", file=sys.stderr)
        enko = {}

    files = sorted(
        [p for p in DATA.glob("n1-extra-words-openjlpt-*.js") if CHUNK_RE.search(p.name)],
        key=lambda p: int(CHUNK_RE.search(p.name).group(1)),
    )
    if not files:
        raise RuntimeError("No OpenJLPT chunk files found")

    all_rows = []
    needed_mt = set()
    for file_index, path in enumerate(files, 1):
        rows = load_js_array(path)
        for row in rows:
            src_id = str(row.get("id", ""))
            if src_id.startswith("oj-"):
                src_id = src_id[3:]
            src = source_by_id.get(src_id)
            all_rows.append((file_index, path, row, src))
            if not src:
                continue

            word = normalize_space(src.get("word"))
            if not ko_dict.get(word):
                for gloss in (src.get("meanings") or [])[:4]:
                    gloss = normalize_space(gloss)
                    if gloss and not enko_lookup(enko, gloss):
                        needed_mt.add(gloss)

            ex = choose_example(src)
            if ex and normalize_space(ex.get("en")):
                needed_mt.add(normalize_space(ex["en"]))

    mt_map = batch_translate(sorted(needed_mt))

    stats = {
        "total": 0,
        "kowiktionary_meanings": 0,
        "dictionary_meanings": 0,
        "mt_meanings": 0,
        "korean_meaning_rows": 0,
        "examples_added": 0,
        "examples_missing": 0,
        "missing_source": 0,
        "files": len(files),
        "mt_unique_strings": len(needed_mt),
    }

    output_by_file = {i: [] for i in range(1, len(files) + 1)}
    for file_index, path, row, src in all_rows:
        stats["total"] += 1
        if not src:
            stats["missing_source"] += 1
            output_by_file[file_index].append(row)
            continue

        english = [normalize_space(x) for x in (src.get("meanings") or []) if normalize_space(x)]
        english_text = " / ".join(english[:4])
        word = normalize_space(src.get("word"))
        ko_glosses = [x for x in ko_dict.get(word, []) if x]

        if ko_glosses:
            meaning_ko = " / ".join(ko_glosses[:4])
            meaning_source = "KoWiktionary"
            stats["kowiktionary_meanings"] += 1
        else:
            translated = []
            used_dict = False
            used_mt = False
            for gloss in english[:4]:
                k = enko_lookup(enko, gloss)
                if k:
                    used_dict = True
                else:
                    k = clean_ko(mt_map.get(gloss, ""))
                    used_mt = used_mt or bool(k)
                if k and k not in translated:
                    translated.append(k)
            meaning_ko = " / ".join(translated)
            if used_dict:
                stats["dictionary_meanings"] += 1
            if used_mt or not used_dict:
                stats["mt_meanings"] += 1
            meaning_source = (
                "Open EN-KO dictionary + Argos" if used_dict and used_mt
                else "Open EN-KO dictionary" if used_dict
                else "Argos en→ko"
            )

        if meaning_ko and HANGUL_RE.search(meaning_ko):
            stats["korean_meaning_rows"] += 1

        examples = []
        ex = choose_example(src)
        if ex:
            ja = furi_html(ex.get("furigana") or ex.get("ja") or "")
            en = normalize_space(ex.get("en") or "")
            ko = clean_ko(mt_map.get(en, ""))
            if ja and ko and HANGUL_RE.search(ko):
                examples = [{"jp": ja, "ko": ko}]
                stats["examples_added"] += 1
            else:
                stats["examples_missing"] += 1
        else:
            stats["examples_missing"] += 1

        new_row = dict(row)
        new_row["w"] = src.get("word") or row.get("w")
        new_row["r"] = src.get("reading") or row.get("r")
        new_row["meaning"] = meaning_ko or english_text
        new_row["meaningEn"] = english_text
        new_row["meaningLang"] = "ko" if meaning_ko and HANGUL_RE.search(meaning_ko) else "en"
        new_row["meaningSource"] = meaning_source
        new_row["source"] = "OpenJLPT"
        new_row["examples"] = examples
        output_by_file[file_index].append(new_row)

    for file_index, path in enumerate(files, 1):
        dump_js_array(path, f"N1_EXTRA_WORDS_OJ_{file_index}", output_by_file[file_index])

    meta = {
        "version": 3,
        "source": "OpenJLPT N1 + Korean Wiktionary + open EN-KO dictionary + Argos Translate",
        **stats,
    }
    (DATA / "openjlpt-ko-enrichment-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(meta, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
