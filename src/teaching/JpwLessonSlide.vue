<script setup lang="ts">
import type { TeachingLineInfo } from "./types";
import type { JpwLessonPhrase } from "./lesson";
import JpwPhraseLineRenderer from "./JpwPhraseLineRenderer.vue";

withDefaults(
  defineProps<{
    phrase: JpwLessonPhrase;
    zoom?: number;
    activeLineIndex?: number;
    teachingGhost?: boolean;
    showKeyChanges?: boolean;
    showDiagnostics?: boolean;
  }>(),
  {
    zoom: 1,
    activeLineIndex: undefined,
    teachingGhost: true,
    showKeyChanges: true,
    showDiagnostics: true
  }
);

defineEmits<{
  "render-error": [value: string];
  "conversion-warnings": [value: string[]];
  "sparks-issues": [value: string[]];
  "lines-ready": [value: TeachingLineInfo[]];
  "line-click": [value: TeachingLineInfo];
}>();

function originalAnchorText(phrase: JpwLessonPhrase): string {
  if (!phrase.originalAnchor) return "";
  const anchor = phrase.originalAnchor;
  const note = anchor.note ? `, note ${anchor.note}` : "";
  const beat = anchor.beat ? `, beat ${anchor.beat}` : "";
  const inside = anchor.startsInsideMeasure || anchor.endsInsideMeasure ? " · lyric phrase" : "";
  return `m${anchor.measure}${note}${beat}${inside}`;
}
</script>

<template>
  <section class="jpw-lesson-slide" :data-phrase-id="phrase.id">
    <div class="jpw-lesson-score">
      <JpwPhraseLineRenderer
        :score="phrase.score"
        :source-text="phrase.sourceText"
        :zoom="zoom"
        :teaching-ghost="teachingGhost"
        :show-key-changes="showKeyChanges"
        :active-line-index="activeLineIndex"
        :show-diagnostics="showDiagnostics"
        @render-error="$emit('render-error', $event)"
        @conversion-warnings="$emit('conversion-warnings', $event)"
        @sparks-issues="$emit('sparks-issues', $event)"
        @lines-ready="$emit('lines-ready', $event)"
        @line-click="$emit('line-click', $event)"
      />
    </div>

    <aside class="jpw-lesson-panel">
      <header>
        <p v-if="phrase.title">{{ phrase.title }}</p>
        <h2>{{ phrase.lyricText || phrase.id }}</h2>
        <span v-if="phrase.reading">{{ phrase.reading }}</span>
        <small v-if="originalAnchorText(phrase)">{{ originalAnchorText(phrase) }}</small>
      </header>

      <p v-if="phrase.translation" class="jpw-lesson-translation">{{ phrase.translation }}</p>

      <section v-if="phrase.grammar?.length" class="jpw-lesson-mark-list">
        <strong>文法</strong>
        <article v-for="item in phrase.grammar" :key="item.id">
          <b>{{ item.surface }}</b>
          <span>{{ item.label }}</span>
          <p v-if="item.reading">{{ item.reading }}</p>
          <p v-if="item.explanation">{{ item.explanation }}</p>
        </article>
      </section>

      <section v-if="phrase.vocabulary?.length" class="jpw-lesson-mark-list">
        <strong>語彙</strong>
        <article v-for="item in phrase.vocabulary" :key="item.id">
          <b>{{ item.surface }}</b>
          <span>{{ item.pos }}</span>
          <p>{{ [item.reading, item.meaning].filter(Boolean).join(" · ") }}</p>
        </article>
      </section>

      <section v-if="phrase.notes?.length" class="jpw-lesson-notes">
        <strong>Notes</strong>
        <p v-for="note in phrase.notes" :key="note">{{ note }}</p>
      </section>
    </aside>
  </section>
</template>
