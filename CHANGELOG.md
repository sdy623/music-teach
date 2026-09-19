# Changelog

## Unreleased

- Double the augmentation stroke weight in teaching and print views.

- Render tuplets as JP-Word-style tapered arcs with centred SMuFL numerals. Use jpeditor's original grace-note geometry, including two continuous reduction beams, octave clearance and hooks below the lower beam, in teaching and print views.
- Parse grace notes and staccato, mordent, fermata and accent marks without adding lyric slots or nominal playback time. Preserve existing numeral fonts.
- Distinguish instrumental section parentheses from note slurs by their relationship to barlines, including nested slurs and tuplets. Enrich older saved score snapshots only in the display projection.
- Show the total duration and bar count of every uninterrupted accompaniment run on each of its pages, accounting for each page's tempo and stopping at vocal or blank pages.
- Add notation and M2 import/reopen regressions. See [notation behavior and limits](docs/neo/notation-semantics-update.md).

## 0.3.0 — 2026-09-13

### Project library and preservation

- Add the local project library, search/filter/sort, duplicate/archive/trash/restore, and score thumbnails.
- Add Worker-based import preflight, explicit commit/readback, IndexedDB persistence, binary attachments and portable project bundles.
- Preserve source snapshots, unknown fields and canonical score anchors through versioned adapters. Reject stale revisions and invalid records while retaining the last valid saved version.
- Add autosave status, recovery drafts, two-page conflict handling, save-as-copy, and named checkpoints.
- Retain the existing phrase editor/player with persistent project routes and lossless v3 JSON round trips. The new library's score view is a preview; unified note/lyric editing and undo/redo remain planned for M3.

### Notation

- Adapt jpeditor's filled slur/tie geometry, continuous reduction beams, and ink-based spacing into one shared print/phrase renderer.
- Add vector augmentation strokes, multi-level beam breaks, low-octave clearance, nested curves and system/page continuations.
- Calibrate the public edition against bundled Noto Sans Display ExtraBold and retain jpeditor's MIT attribution.

### Distribution

- Add portable, web, WebView, Pages and Cloudflare build targets. Portable targets use relative assets and hash routing; Cloudflare includes the SPA fallback.
- Keep the Korean lesson placeholder with synthetic rhythm only. Large-project regressions use an original generated scale exercise.
- Update the English/Chinese guides for the project library and retained legacy editor. Temporary runtime probe pages and private repertoire are excluded from source releases.

## 0.2.0

Teaching-project JSON round trips, phrase editing, title credits/tags, section progress, playback scheduling, ruby data and phrase-player export.
