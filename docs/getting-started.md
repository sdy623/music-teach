# Getting Started

[English](getting-started.md) | [简体中文](getting-started.zh-CN.md)

This guide takes a JPW-ABC file from local import to a reusable Vue or Slidev teaching slide.

## 1. Install and run the studio

Requirements:

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- a modern browser with SVG support

```bash
git clone <repository-url>
cd <repository-directory>
npm ci
npm run dev
```

Open `http://localhost:5173/library` for the local project library. Start with the [project library guide](project-library.md) for reviewed imports, saved drafts, checkpoints, and recovery. The phrase-editing workflow below uses `/legacy/projects/new`. Vite binds to localhost with a strict port; use `npm run dev -- --port 5174` if the default port is unavailable.

## 2. Import JPW-ABC

The project studio accepts `.jpwabc`, `.abc`, and exported JSON project files.

1. Open **Legacy editor** at `/legacy/projects/new`.
2. Choose **Import** and select a JPW-ABC file.
3. Check the detected encoding, phrase count, and diagnostics.
4. Review title, artist, lyricist, composer, arranger, key/meter, and expression.
5. Export the edited project as JSON when you need a portable teaching-project file.

`convertJPWABCToTeachingProject()` recognizes UTF-8, UTF-16LE, and UTF-16BE. Parser warnings are retained as diagnostics; an unknown token should not discard the rest of the score.

The importer uses `.Words` blocks as alignment evidence. It does not infer music timing from plain lyric text.

## 3. Prepare lyric slots

JPW-ABC lyrics are score-alignment cells, not ordinary prose:

- a normal character consumes one singable slot;
- `ー` consumes a slot as an extension and inherits the previous linguistic token;
- `{text}` keeps multiple characters in one score slot;
- `/`, `//`, and `///` create candidate phrase boundaries;
- rests are skipped by default, while notes and `X` rhythm events are lyric-alignable.

Example:

```text
まちあかりーてらーーしたー
```

The display cells include every `ー`, but normalized text becomes `まちあかりてらした`.

Do not remove extension cells merely to make the visible text look shorter. Slot identity is shared by lyric highlighting, playback, and tie-ghost rendering.

## 4. Edit phrases and sections

The teaching project stores one `voiceLine` and one lyric string per phrase. A phrase may be:

- `vocal`: rendered with aligned lyrics;
- `instrumental`: useful for intros, interludes, and accompaniment cues;
- `blank`: a text-only or pause slide.

Use annotations for free teaching notes such as breathing, instrument entries, repeated motives, or playback instructions. `showMetronome` controls the beat indicator, and `skipDuringPlayback` lets an automatic run omit selected accompaniment phrases.

Sections are split points, not labels duplicated under every phrase. Assign `Verse`, `Pre-Chorus`, `Chorus`, `Bridge`, letter sections, or a custom section at the phrase where that section begins. The label remains active until the next split point.

## 5. Render from TypeScript

```ts
import {
  buildLessonDeck,
  decodeJPWABC,
  parseJPWABC
} from "music-teach";

const buffer = await fetch("/fixtures/sakura.jpwabc")
  .then((response) => response.arrayBuffer());
const decoded = decodeJPWABC(buffer);
const parsed = parseJPWABC(decoded);
const deck = buildLessonDeck(parsed.value, {
  id: "sakura-lesson"
});

console.table(parsed.diagnostics);
console.log(deck.phrases);
```

For source-specific segmentation:

```ts
const deck = buildLessonDeck(parsed.value, {
  joinSoftBreaks: [
    { left: "firstnormalizedpart", right: "secondnormalizedpart" }
  ],
  splitPhrases: [
    { text: "targetnormalizedtext", afterSlots: [8, 16] }
  ]
});
```

`afterSlots` counts aligned singing slots, including lyric extensions. It does not count normalized language tokens.

## 6. Use the Vue component

Build the library when consuming this checkout as a local package:

```bash
npm run build:lib
```

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  JianpuVideoLessonSlide,
  type JianpuLessonDeck
} from "music-teach";
import "music-teach/style.css";

const props = defineProps<{ deck: JianpuLessonDeck }>();
const phraseIndex = ref(0);
const activeSlot = ref(-1);
const phrase = computed(() => props.deck.phrases[phraseIndex.value]!);
</script>

<template>
  <JianpuVideoLessonSlide
    :phrase="phrase"
    :active-slot="activeSlot"
    :teaching-ghost="true"
    :show-key-changes="true"
  />
</template>
```

The host owns playback state. Advance `activeSlot` from Web Audio, a video timeline, MIDI, or classroom controls. The notation component remains deterministic and does not start audio itself.

For a single manually entered phrase, use `SlidevJianpuPhrase` with `voice-line`, `lyric-text`, `key-and-meters`, and `expression`; see the [Slidev guide](slidev-integration.md).

## 7. Validate notation changes

```bash
npm run test
npm run build
npm run build:lib
```

Open `/scores/notation-reference` when changing notation geometry. The fixture covers reduction beams, barlines, repeats, accidentals, meter changes, rests, `X`, tuplets, ties, and termination lines.

Important invariants:

- reduction beams connect only inside their beat group;
- barlines align to the notation band, not to lyric height;
- a temporary meter is a score event and does not rewrite title metadata;
- tie ghost changes note attacks, not lyric positions;
- screen layouts scale the fixed phrase frame rather than reflowing it.

## Content and licensing

Keep copyrighted or private repertoire outside the source repository. Import it locally as JPW-ABC or teaching-project JSON. Only add a fixture when its redistribution status is clear and documented.

The project source is GPL-3.0-only. Bundled third-party assets retain their own licenses; see `THIRD_PARTY_NOTICES.md`.
