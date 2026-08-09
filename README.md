# Music Teach

[English](README.md) | [简体中文](README.zh-CN.md)

Music Teach is a Vue 3 and SVG component library for phrase-by-phrase music teaching. It builds a typed score and phrase IR, lays out one singable phrase at a time, and renders an interactive fixed 16:9 teaching frame.

JPW-ABC is the current first-class score import adapter and jianpu is the first renderer. The project boundary is deliberately wider: the same phrase IR can support other score sources, staff notation, playback timelines, and additional teaching layers.

The repository intentionally ships only a public-domain folk-song demo and synthetic notation fixtures. Bring other repertoire in as local JPW-ABC files or exported teaching-project JSON; song files are content, not library source.

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

Open `http://127.0.0.1:5173/scores/sakura`.

- `/scores/sakura/phrases/1`: one teaching phrase
- `/scores/sakura/sections`: section split-point editor
- `/scores/notation-reference`: notation regression fixture
- `/scores/rhythm-x`: pitchless rhythm fixture
- `/projects/new`: create or import a teaching project
- `/legacy/sakura`: print-oriented renderer

```bash
npm run test
npm run build
npm run build:lib
```

See the [English getting-started guide](docs/getting-started.md) or the [中文入门教程](docs/getting-started.zh-CN.md) for the complete import-to-slide workflow.

## Importing Content

Use **New teaching project** to import either:

- a `.jpwabc` file, converted into an editable teaching project; or
- a `.teaching-project.json` file previously exported by the studio.

Project JSON keeps metadata, source lyrics, phrase-level JPW-ABC, annotations, playback flags, and section split points. Keep licensed or private repertoire outside the repository and import it locally when needed.

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

- This is not a JP-Word editor or a pixel-identical paper renderer.
- Chords, grace-note detail, complex attachments, and multiple voices are incomplete.
- Automatic linguistic analysis is intentionally outside the notation core.
- `StaffRenderer` remains a placeholder.
- The package remains marked `private` until a release name and version are chosen.

## Fixtures

- `public/fixtures/sakura.jpwabc`: public-domain folk-song smoke test
- `public/fixtures/notation-reference.jpwabc`: synthetic notation conformance test
- `public/fixtures/rhythm-x.jpwabc`: synthetic pitchless-rhythm test

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
