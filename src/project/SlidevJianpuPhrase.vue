<script setup lang="ts">
import { computed } from "vue";
import { parseJPWABC } from "../parser/parseJPWABC";
import { buildLessonDeck } from "../slide/buildLessonDeck";
import JianpuLessonSlide from "../slide/JianpuLessonSlide.vue";
import type { JianpuPhraseFrame, PhraseSlot } from "../slide/types";
import { buildPhraseJPWABC } from "../teaching/lesson";
import "./project.css";

const props = withDefaults(
  defineProps<{
    phrase?: JianpuPhraseFrame;
    sourceText?: string;
    voiceLine?: string;
    lyricText?: string;
    referenceReading?: string;
    title?: string;
    artist?: string;
    credits?: string;
    keyAndMeters?: string;
    expression?: string;
    section?: string;
    annotation?: string;
    activeSlot?: number;
    teachingGhost?: boolean;
    showMetronome?: boolean;
    showKeyChanges?: boolean;
  }>(),
  {
    phrase: undefined,
    sourceText: "",
    voiceLine: "",
    lyricText: "",
    referenceReading: "",
    title: "教学乐句",
    artist: "",
    credits: "",
    keyAndMeters: "1=C,4/4",
    expression: "J=80",
    section: "",
    annotation: "",
    activeSlot: -1,
    teachingGhost: true,
    showMetronome: true,
    showKeyChanges: true
  }
);

const emit = defineEmits<{
  "select-slot": [slot: PhraseSlot, index: number];
}>();

const generatedSource = computed(() => {
  if (props.sourceText.trim()) return props.sourceText;
  if (!props.voiceLine.trim()) return "";
  return buildPhraseJPWABC({
    title: props.title,
    keyAndMeters: props.keyAndMeters,
    expression: props.expression,
    voice: props.voiceLine,
    words: props.referenceReading || props.lyricText
  });
});

const renderedPhrase = computed<JianpuPhraseFrame | undefined>(() => {
  let base = props.phrase;
  if (!base && generatedSource.value) {
    try {
      base = buildLessonDeck(parseJPWABC(generatedSource.value).value, {
        id: "slidev-phrase"
      }).phrases[0];
    } catch {
      base = undefined;
    }
  }
  if (!base) return undefined;

  return {
    ...base,
    title: props.title || base.title,
    teaching: {
      ...base.teaching,
      surface: props.lyricText || base.teaching?.surface,
      reading: props.referenceReading || base.teaching?.reading,
      coachNote: props.annotation || base.teaching?.coachNote
    }
  };
});

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
