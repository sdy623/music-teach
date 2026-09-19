<script setup lang="ts">
import { computed } from "vue";
import JianpuLessonSlide from "../slide/JianpuLessonSlide.vue";
import type {
  JianpuPhraseFrame,
  PhraseSlot,
  SongProgressSection,
  TeachingHighlightPalette,
  TeachingMark
} from "../slide/types";
import { buildRenderableProjectPhrase } from "./projectPhraseSemantics";
import type {
  MorphologyToken,
  TeachingPhraseKind,
  TeachingProjectKeyChange,
  TeachingProjectLyricCell
} from "./types";
import "./project.css";

const props = withDefaults(
  defineProps<{
    phrase?: JianpuPhraseFrame;
    kind?: TeachingPhraseKind;
    sourceText?: string;
    voiceLine?: string;
    lyricText?: string;
    lyricJpwabc?: string;
    lyricCells?: readonly TeachingProjectLyricCell[];
    referenceReading?: string;
    morphology?: readonly MorphologyToken[];
    keyOfOne?: string;
    keyChanges?: readonly TeachingProjectKeyChange[];
    title?: string;
    artist?: string;
    credits?: string;
    tags?: readonly string[];
    keyAndMeters?: string;
    expression?: string;
    section?: string;
    annotation?: string;
    activeSlot?: number;
    teachingGhost?: boolean;
    showMetronome?: boolean;
    showKeyChanges?: boolean;
    teachingMarks?: readonly TeachingMark[];
    highlightPalette?: TeachingHighlightPalette;
    phraseIndex?: number;
    phraseCount?: number;
    progressSections?: readonly SongProgressSection[];
  }>(),
  {
    phrase: undefined,
    kind: undefined,
    sourceText: "",
    voiceLine: "",
    lyricText: "",
    lyricJpwabc: "",
    lyricCells: () => [],
    referenceReading: "",
    morphology: () => [],
    keyOfOne: "",
    keyChanges: () => [],
    title: "教学乐句",
    artist: "",
    credits: "",
    tags: () => [],
    keyAndMeters: "1=C,4/4",
    expression: "J=80",
    section: "",
    annotation: "",
    activeSlot: -1,
    teachingGhost: true,
    showMetronome: true,
    showKeyChanges: true,
    teachingMarks: () => [],
    highlightPalette: () => ({}),
    phraseCount: 1,
    progressSections: () => []
  }
);

const emit = defineEmits<{
  "select-slot": [slot: PhraseSlot, index: number];
}>();

const renderedPhrase = computed<JianpuPhraseFrame | undefined>(() =>
  buildRenderableProjectPhrase({
    phrase: props.phrase,
    kind: props.kind,
    sourceText: props.sourceText,
    voiceLine: props.voiceLine,
    lyricText: props.lyricText,
    lyricJpwabc: props.lyricJpwabc,
    lyricCells: props.lyricCells,
    referenceReading: props.referenceReading,
    morphology: props.morphology,
    keyOfOne: props.keyOfOne,
    keyChanges: props.keyChanges,
    title: props.title,
    keyAndMeters: props.keyAndMeters,
    expression: props.expression,
    annotation: props.annotation,
    phraseIndex: props.phraseIndex,
    teaching: props.teachingMarks.length
      ? { marks: [...props.teachingMarks] }
      : undefined
  })
);

function forwardSlot(slot: PhraseSlot, index: number): void {
  emit("select-slot", slot, index);
}
</script>

<template>
  <JianpuLessonSlide
    v-if="renderedPhrase"
    :phrase="renderedPhrase"
    :active-slot="activeSlot"
    :teaching-ghost="teachingGhost"
    :show-beat-pulse="showMetronome"
    :show-key-changes="showKeyChanges"
    :section-label="section"
    :annotation="annotation"
    :artist="artist"
    :credits="credits"
    :tags="tags"
    :phrase-count="phraseCount"
    :progress-sections="progressSections"
    :highlight-palette="highlightPalette"
    @select-slot="forwardSlot"
  />

  <article v-else class="slidev-jianpu-blank">
    <header>
      <span>{{ section || "BLANK" }}</span>
      <div>
        <strong>{{ title }}</strong>
        <small v-if="artist || credits">
          <template v-if="artist">{{ artist }}</template>
          <template v-if="artist && credits"> · </template>
          <template v-if="credits">{{ credits }}</template>
        </small>
      </div>
    </header>
    <main>
      <p class="slidev-blank-lyric">{{ lyricText || " " }}</p>
      <p v-if="referenceReading && referenceReading !== lyricText" class="slidev-blank-reading">
        {{ referenceReading }}
      </p>
    </main>
    <footer>{{ annotation }}</footer>
  </article>
</template>
