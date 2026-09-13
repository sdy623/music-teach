# Music Teach

[English](README.md) | [简体中文](README.zh-CN.md)

Music Teach is a Vue 3 and SVG component library for phrase-by-phrase music teaching. It builds a typed score and phrase IR, lays out one singable phrase at a time, and renders an interactive fixed 16:9 teaching frame.

JPW-ABC is the current first-class score import adapter and jianpu is the first renderer. The project boundary is deliberately wider: the same phrase IR can support other score sources, staff notation, playback timelines, and additional teaching layers.

The repository intentionally ships only a public-domain folk-song demo and synthetic notation fixtures. Bring other repertoire in as local JPW-ABC files or exported teaching-project JSON; song files are content, not library source.

Version 0.3.0 adds a local project library, reviewed imports, revision conflict protection, recovery drafts, checkpoints, attachments, and shared slur/augmentation/reduction engraving adapted from jpeditor. The existing teaching editor and phrase player remain available. See the [changelog](CHANGELOG.md) and [project library guide](docs/project-library.md).

This project is aimed at music-teaching videos, classroom slides, and phrase-by-phrase practice tools. It is not a JP-Word clone: notation semantics are parsed into typed IR first, while the Vue components render a stable 16:9 teaching frame that a host application can highlight and control.

## Pipeline

```text
JPW-ABC ArrayBuffer
-> decodeJPWABC
-> parser / ScoreIR
-> lyric-to-event alignment
-> configurable phrase segmentation
-> JianpuPhraseFrame[]
-> SVG phrase layout
-> Vue / Slidev teaching slide
```

PDF examples and publishing references are calibration evidence only. They are not read at runtime and are not redistributed with this project.

## Run

```bash
npm ci
npm run dev
```

Open `http://localhost:5173/library`.

- `/scores/sakura/phrases/1`: one teaching phrase
- `/scores/sakura/sections`: section split-point editor
- `/scores/notation-reference`: notation regression fixture
- `/scores/rhythm-x`: pitchless rhythm fixture
- `/scores/im-eul-wihan-haengjingok`: Korean lesson placeholder for *임을 위한 행진곡*
- `/library`: browse, import, duplicate, archive, and restore projects
- `/projects/new`: create a saved blank score
- `/legacy/projects/new`: use the existing phrase editor and project player

```bash
npm run test
npm run build
npm run build:web
npm run build:webview
npm run build:pages
npm run build:cloudflare
npm run build:lib
```

The project library saves to IndexedDB in the current browser. Imports are previewed before an explicit commit; metadata edits show their save status and revision. The legacy editor saves separately, and **Play current project** restores its project after navigation or refresh.

The default `build` writes a portable static app to `dist` with relative assets and hash routing, so it can be hosted under any nested path. `build:web`, `build:webview`, and `build:pages` write equivalent portable packages to `dist-web`, `dist-webview`, and `dist-pages`; a Pages URL can look like `/music-teach/#/scores/sakura` without hard-coding the repository name. `build:cloudflare` keeps history routing and writes the SPA fallback to `dist-cloudflare`. `build:all` creates every package without publishing it.

See the [English getting-started guide](docs/getting-started.md) or the [中文入门教程](docs/getting-started.zh-CN.md) for the complete import-to-slide workflow.

## Importing Content

Use **Import project** in the library to preview JPW-ABC, MusicProject, or exported library bundles, then choose **Confirm import** to save. Migrating a v3 teaching project requires a paired JPW-ABC score as its canonical source.

For the existing phrase editing workflow, open **Legacy editor** and import either:

- a `.jpwabc` file, converted into an editable teaching project; or
- a `.teaching-project.json` file previously exported by the studio.

Project JSON keeps metadata, tags, original lyrics, readings, morphology/ruby data, phrase-level JPW-ABC, aligned lyric cells, key changes, rendered phrase snapshots, instrumental passages, annotations, playback flags, and section split points. Exporting and importing the same project preserves the teaching timeline. Keep licensed or private repertoire outside the repository and import it locally when needed.

## Vue Usage

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  buildLessonDeck,
  decodeJPWABC,
  JianpuVideoLessonSlide,
  parseJPWABC
} from "music-teach";

const buffer = await fetch("/fixtures/sakura.jpwabc").then((response) => response.arrayBuffer());
const score = parseJPWABC(decodeJPWABC(buffer)).value;
const deck = buildLessonDeck(score);
const phraseIndex = ref(0);
const phrase = computed(() => deck.phrases[phraseIndex.value]!);
</script>

<template>
  <JianpuVideoLessonSlide
    :phrase="phrase"
    :active-slot="3"
    :teaching-ghost="true"
  />
</template>
```

For phrase-specific control, `joinSoftBreaks` merges explicit soft lyric boundaries and `splitPhrases.afterSlots` cuts on aligned singing slots. A Japanese extension mark `ー` consumes a score slot but does not enter `normalizedText`, so lyric highlighting and tie ghosts share one timeline.

Slidev integration is documented in [English](docs/slidev-integration.md) and [简体中文](docs/slidev-integration.zh-CN.md).

## Public Modules

- `decodeJPWABC` and `parseJPWABC`
- `convertJPWABCToTeachingProject`
- `buildLessonDeck` and `layoutPhrase`
- `JianpuPhraseNotation`
- `JianpuVideoLessonSlide`
- `SlidevJianpuPhrase`
- `JianpuPhraseFrame` and teaching-project types

## Supported Subset

- UTF-8, UTF-16LE, and UTF-16BE JPW-ABC
- notes `1-7`, rests `0`, and pitchless rhythm `X`
- octave dots, accidentals, augmentation, dots, and reduction beams
- beat-scoped reduction-beam grouping
- barlines, repeats, temporary meters, slurs, ties, and tuplets
- `.Words` anchors and lyric-slot alignment
- extension placeholders and tie-ghost teaching mode
- text attachments and key-change annotations
- fixed-layout phrase slides with interactive slot highlighting
- project metadata, annotations, playback flags, and section split points

## Current Limits

- The new library supports metadata editing and score previews. Note/lyric editing with undo/redo is planned for M3; the existing phrase editor is a separate workflow.
- Browser data is local to each origin. Export backups before clearing site data; cloud sync is not included.
- This is not a JP-Word editor or a pixel-identical paper renderer.
- Chords, grace-note detail, complex attachments, and multiple voices are incomplete.
- Automatic linguistic analysis is intentionally outside the notation core.
- `StaffRenderer` remains a placeholder.
- npm registry publishing is disabled; supported source releases are published on GitHub.

## Fixtures

- `public/fixtures/sakura.jpwabc`: public-domain folk-song smoke test
- `public/fixtures/notation-reference.jpwabc`: synthetic notation conformance test
- `public/fixtures/rhythm-x.jpwabc`: synthetic pitchless-rhythm test
- `public/fixtures/im-eul-wihan-haengjingok-placeholder.jpwabc`: stable song slot with synthetic placeholder rhythm only; no melody or lyrics from the song

To add a redistributable fixture, place it in `public/fixtures/`, register it in `src/demo/fixtures.ts`, and document its provenance and license. Unknown tokens produce diagnostics instead of crashing the page.

Architecture and notation invariants are documented in [docs/teaching-slide-architecture.md](docs/teaching-slide-architecture.md) and [docs/jianpu-notation-conformance.md](docs/jianpu-notation-conformance.md).

## Documentation

| Topic | English | 简体中文 |
| --- | --- | --- |
| Installation, importing, and Vue usage | [Getting started](docs/getting-started.md) | [入门教程](docs/getting-started.zh-CN.md) |
| Slidev integration | [Slidev guide](docs/slidev-integration.md) | [Slidev 接入](docs/slidev-integration.zh-CN.md) |
| Architecture | [Teaching slide architecture](docs/teaching-slide-architecture.md) | Same document, currently Chinese-first |
| Notation rules | [Jianpu conformance](docs/jianpu-notation-conformance.md) | Same document, currently Chinese-first |

## License

The project source is licensed under GPL-3.0-only. Third-party components retain their original licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
