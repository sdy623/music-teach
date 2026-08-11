<script setup lang="ts">
import { computed } from "vue";
import type { SongProgressSection } from "./types";

const props = withDefaults(
  defineProps<{
    phraseIndex?: number;
    phraseCount?: number;
    phraseProgress?: number;
    sections?: readonly SongProgressSection[];
  }>(),
  {
    phraseIndex: 0,
    phraseCount: 1,
    phraseProgress: 0,
    sections: () => []
  }
);

const safePhraseCount = computed(() => Math.max(1, props.phraseCount));
const progressPercent = computed(() => {
  const phraseProgress = Math.max(0, Math.min(1, props.phraseProgress));
  const position = Math.max(0, Math.min(safePhraseCount.value, props.phraseIndex + phraseProgress));
  return (position / safePhraseCount.value) * 100;
});

function sectionStyle(section: SongProgressSection): Record<string, string> {
  const start = Math.max(0, section.startPhrase);
  const end = Math.max(start, section.endPhrase);
  return {
    left: `${(start / safePhraseCount.value) * 100}%`,
    width: `${((end - start + 1) / safePhraseCount.value) * 100}%`
  };
}
</script>

<template>
  <footer
    class="lesson-song-progress"
    :data-song-progress="progressPercent.toFixed(2)"
    aria-label="全曲进度"
  >
    <span class="lesson-song-progress-fill" :style="{ width: `${progressPercent}%` }"></span>
    <span
      v-for="section in sections"
      :key="`${section.id}-${section.startPhrase}`"
      class="lesson-song-progress-section"
      :class="{ 'is-current': phraseIndex >= section.startPhrase && phraseIndex <= section.endPhrase }"
      :style="sectionStyle(section)"
      :data-section-id="section.id"
    >
      <i></i>
      <b>{{ section.label }}</b>
    </span>
  </footer>
</template>
