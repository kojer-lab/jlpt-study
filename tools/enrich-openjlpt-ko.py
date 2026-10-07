#!/usr/bin/env python3
import json
import re
import sys
import time
from pathlib import Path
from collections import defaultdict

import requests
import argostranslate.package
import argostranslate.translate

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OPENJLPT_URL = "https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/n1.json"
KAIKKI_URL = "https://kaikki.org/kowiktionary/%EC%9D%BC%EB%B3%B8%EC%96%B4/kaikki.org-dictionary-%EC%9D%BC%EB%B3%B8%EC%96%B4.jsonl"
ARGOS_EN_KO_URL = "https://argos-net.com/v1/translate-en_ko-1_1.argosmodel"
CHUNK_RE = re.compile(r"n1-extra-words-openjlpt-(\d+)\.js$")

def fetch_bytes(url, timeout=180):
    headers = {"User-Agent": "jlpt-study-data-builder/1.0"}
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
    payload = re.sub(r";\s*$", "", text[eq+1:].strip())
    return json.loads(payload)

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

def install_argos_en_ko():
    try:
        installed = argostranslate.translate.get_installed_languages()
        en = next((x for x in installed if x.code == "en"), None)
        ko = next((x for x in installed if x.code == "ko"), None)
        if en and ko and en.get_translation(ko):
            return
    except Exception:
        pass

    model_path = ROOT / ".tmp-en-ko.argosmodel"
    print("Downloading Argos en→ko model...")
    model_path.write_bytes(fetch_bytes(ARGOS_EN_KO_URL, timeout=300))
    argostranslate.package.install_from_path(model_path)
    model_path.unlink(missing_ok=True)

def translator():
    install_argos_en_ko()
    installed = argostranslate.translate.get_installed_languages()
    en = next(x for x in installed if x.code == "en")
    ko = next(x for x in installed if x.code == "ko")
    return en.get_translation(ko)

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
                if g and g not in by_word[word]:
                    by_word[word].append(g)
    return by_word

def furi_html(s):
    if not s:
        return ""
    # OpenJLPT/Tatoeba furigana format: {表記|よみ}
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
    # Prefer a short, readable sentence.
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
        print(f"Warning: Korean Wiktionary unavailable; falling back to MT: {e}", file=sys.stderr)
        ko_dict = {}

    tr = translator()
    mt_cache = {}

    def mt(text):
        text = normalize_space(text)
        if not text:
            return ""
        if text in mt_cache:
            return mt_cache[text]
        try:
            out = clean_ko(tr.translate(text))
        except Exception as e:
            print(f"MT failed: {text!r}: {e}", file=sys.stderr)
            out = text
        mt_cache[text] = out
        return out

    files = sorted(
        [p for p in DATA.glob("n1-extra-words-openjlpt-*.js") if CHUNK_RE.search(p.name)],
        key=lambda p: int(CHUNK_RE.search(p.name).group(1)),
    )
    if not files:
        raise RuntimeError("No OpenJLPT chunk files found")

    stats = {
        "total": 0,
        "ko_dict_meanings": 0,
        "mt_meanings": 0,
        "examples_added": 0,
        "examples_missing": 0,
        "missing_source": 0,
        "files": len(files),
    }

    for file_index, path in enumerate(files, 1):
        rows = load_js_array(path)
        var_name = f"N1_EXTRA_WORDS_OJ_{file_index}"
        print(f"Processing {path.name}: {len(rows)} entries")
        out_rows = []

        for i, row in enumerate(rows, 1):
            stats["total"] += 1
            src_id = str(row.get("id", ""))
            if src_id.startswith("oj-"):
                src_id = src_id[3:]
            src = source_by_id.get(src_id)
            if not src:
                stats["missing_source"] += 1
                out_rows.append(row)
                continue

            english = [normalize_space(x) for x in (src.get("meanings") or []) if normalize_space(x)]
            english_text = " / ".join(english[:4])
            word = normalize_space(src.get("word"))

            ko_glosses = [x for x in ko_dict.get(word, []) if x]
            if ko_glosses:
                meaning_ko = " / ".join(ko_glosses[:4])
                meaning_source = "KoWiktionary"
                stats["ko_dict_meanings"] += 1
            else:
                translated = []
                for g in english[:4]:
                    k = mt(g)
                    if k and k not in translated:
                        translated.append(k)
                meaning_ko = " / ".join(translated) if translated else english_text
                meaning_source = "Argos en→ko"
                stats["mt_meanings"] += 1

            examples = []
            ex = choose_example(src)
            if ex:
                ja = furi_html(ex.get("furigana") or ex.get("ja") or "")
                ko = mt(ex.get("en") or "")
                if ja and ko:
                    examples = [{"jp": ja, "ko": ko}]
                    stats["examples_added"] += 1
                else:
                    stats["examples_missing"] += 1
            else:
                stats["examples_missing"] += 1

            new_row = dict(row)
            new_row["w"] = src.get("word") or row.get("w")
            new_row["r"] = src.get("reading") or row.get("r")
            new_row["meaning"] = meaning_ko
            new_row["meaningEn"] = english_text
            new_row["meaningLang"] = "ko"
            new_row["meaningSource"] = meaning_source
            new_row["source"] = "OpenJLPT"
            new_row["examples"] = examples
            out_rows.append(new_row)

            if i % 100 == 0:
                print(f"  {i}/{len(rows)}")

        dump_js_array(path, var_name, out_rows)

    meta = {
        "version": 1,
        "source": "OpenJLPT N1 + Korean Wiktionary + Argos Translate en→ko",
        **stats,
    }
    (DATA / "openjlpt-ko-enrichment-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(meta, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
