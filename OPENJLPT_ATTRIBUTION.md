# Vocabulary data attribution

This JLPT study project includes a curated vocabulary bank and a larger N1 bank derived from open language-learning datasets.

## OpenJLPT

The bulk N1 vocabulary list, Japanese readings, English glosses, and example-sentence links are derived from **OpenJLPT** by Evan Clancy and contributors.

- Source: https://github.com/evanclan/OpenJLPT
- License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- OpenJLPT notes that JLPT vocabulary levels are community approximations because the JLPT has not published official vocabulary lists since 2010.
- Example sentences in OpenJLPT are sourced from Tatoeba where available; see OpenJLPT's NOTICE file for per-field provenance.

## Korean Wiktionary / Kaikki

Korean glosses are used when a matching Japanese entry is available in the Korean-language Wiktionary extract distributed by Kaikki.org.

- Source: https://kaikki.org/kowiktionary/
- License: CC BY-SA 4.0
- Extraction tooling: Wiktextract

## Argos Translate

When no Korean dictionary gloss is available, English glosses and English example translations are machine-translated into Korean using the open-source **Argos Translate** English→Korean model.

- Project: https://github.com/argosopentech/argos-translate
- Model package: translate-en_ko
- The generated Korean text is treated as machine-assisted study material and can be manually refined over time.

Curated Korean entries written specifically for this site take precedence over imported entries.

## Tatoeba Korean translations

Where available, Japanese example sentences are paired with Korean translations directly from Tatoeba rather than machine translation.

- Source: https://tatoeba.org/
- API: https://api.tatoeba.org/
- Text license: CC BY 2.0 FR by default; some original sentences may be CC0 1.0
- Sentence IDs are retained in the generated vocabulary data when a Tatoeba Korean translation is used.

See Tatoeba's download and reuse documentation for attribution requirements.
