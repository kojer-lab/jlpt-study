# Vocabulary data attribution

The file `data/n1-extra-words-openjlpt.js` is a generated derivative dataset and is distributed under **CC BY-SA 4.0**.

It contains vocabulary data derived from:

- **OpenJLPT** — https://github.com/evanclan/OpenJLPT — CC BY-SA 4.0.
- OpenJLPT in turn uses JMdict (EDRDG), Jonathan Waller's JLPT lists, and Tatoeba example sentences. See OpenJLPT's NOTICE for field-level attribution and upstream licenses.
- Korean gloss assistance is derived from **Open English-Korean Dictionary** — https://github.com/jhseo1211/open-english-korean-dict — CC BY-SA 4.0.

Tatoeba example sentence IDs are preserved when available. The application code is separate from this generated dataset; this notice applies to the derivative vocabulary data and its redistributed source fields.

Changes made by this project include: selecting N1 entries, removing entries already covered by the curated in-app vocabulary bank, converting furigana notation to the site's markup, selecting one example sentence per imported word, and mapping English glosses to Korean where an open dictionary match is available.
