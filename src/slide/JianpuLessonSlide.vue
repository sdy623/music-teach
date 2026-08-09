<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import JianpuPhraseNotation from "./JianpuPhraseNotation.vue";
import type { JianpuPhraseFrame, PhraseSlot } from "./types";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const props = withDefaults(
  defineProps<{
    phrase: JianpuPhraseFrame;
    activeSlot?: number;
    teachingGhost?: boolean;
    showRomaji?: boolean;
    showTranslation?: boolean;
    showBeatPulse?: boolean;
    showKeyChanges?: boolean;
    showOpeningContext?: boolean;
    sectionLabel?: string;
    annotation?: string;
    artist?: string;
    credits?: string;
  }>(),
  {
    activeSlot: -1,
    teachingGhost: true,
    showRomaji: true,
    showTranslation: true,
    showBeatPulse: true,
    showKeyChanges: true,
    showOpeningContext: false,
    sectionLabel: "",
    annotation: "",
    artist: "",
    credits: ""
  }
);

const emit = defineEmits<{
  "select-slot": [slot: PhraseSlot, index: number];
}>();

const viewport = ref<HTMLElement>();
const scale = ref(1);
let resizeObserver: ResizeObserver | undefined;

const progress = computed(() => {
  if (props.phrase.slots.length <= 1 || props.activeSlot < 0) return 0;
  return Math.min(1, props.activeSlot / (props.phrase.slots.length - 1));
});
const teachingSurface = computed(() => props.phrase.teaching?.surface || props.phrase.normalizedText);
const teachingReading = computed(() => props.phrase.teaching?.reading || props.phrase.normalizedText);
const canvasStyle = computed(() => ({
  width: `${CANVAS_WIDTH}px`,
  height: `${CANVAS_HEIGHT}px`,
  transform: `scale(${scale.value})`
}));

function forwardSlot(slot: PhraseSlot, index: number): void {
  emit("select-slot", slot, index);
}

function updateScale(): void {
  const width = viewport.value?.clientWidth ?? CANVAS_WIDTH;
  scale.value = width > 0 ? width / CANVAS_WIDTH : 1;
}

onMounted(() => {
  updateScale();
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(updateScale);
    if (viewport.value) resizeObserver.observe(viewport.value);
  } else {
    window.addEventListener("resize", updateScale);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("resize", updateScale);
});
</script>

<template>
  <div ref="viewport" class="jianpu-slide-viewport">
    <article
      class="jianpu-lesson-slide"
      :class="{
        'is-opening-slide': showOpeningContext,
        'is-continuation-slide': !showOpeningContext
      }"
      :data-phrase-id="phrase.id"
      :style="canvasStyle"
    >
      <header class="lesson-slide-header">
        <div class="lesson-song-heading">
          <span>
            <template v-if="sectionLabel">{{ sectionLabel }} · </template>
            JIANPU LESSON · {{ String(phrase.index + 1).padStart(2, "0") }}
          </span>
          <h1>{{ phrase.title }}</h1>
          <p v-if="artist || credits" class="lesson-song-credits">
            <strong v-if="artist">{{ artist }}</strong>
            <span v-if="credits">{{ credits }}</span>
          </p>
        </div>
        <div class="lesson-source-anchor">
          <span>BAR {{ phrase.sourceAnchor.startMeasure }}–{{ phrase.sourceAnchor.endMeasure }}</span>
          <strong>
            1={{ phrase.keyOfOne }}<template v-if="phrase.tempo"> · BPM {{ phrase.tempo }}</template>
          </strong>
        </div>
      </header>

      <section class="lesson-notation-band">
        <JianpuPhraseNotation
          :phrase="phrase"
          :active-slot="activeSlot"
          :teaching-ghost="teachingGhost"
          :show-beat-pulse="showBeatPulse"
          :show-key-changes="showKeyChanges"
          :show-context="showOpeningContext"
          @select-slot="forwardSlot"
        />
      </section>

      <section class="lesson-language-band">
        <div class="lesson-language-primary">
          <ruby>
            {{ teachingSurface }}
            <rt v-if="teachingSurface !== teachingReading">{{ teachingReading }}</rt>
          </ruby>
          <p v-if="showRomaji && phrase.teaching?.romaji" class="lesson-romaji">{{ phrase.teaching.romaji }}</p>
          <p v-if="showTranslation && phrase.teaching?.translation" class="lesson-translation">
            {{ phrase.teaching.translation }}
          </p>
        </div>

        <div v-if="phrase.teaching?.marks?.length" class="lesson-mark-strip">
          <div
            v-for="mark in phrase.teaching.marks.slice(0, 3)"
            :key="mark.id"
            class="lesson-mark"
            :class="`tone-${mark.tone}`"
          >
            <span>{{ mark.surface }}</span>
            <strong>{{ mark.label }}</strong>
            <p>{{ mark.explanation || mark.reading }}</p>
          </div>
        </div>
        <p v-else class="lesson-coach-note">
          {{
            annotation ||
            phrase.teaching?.coachNote ||
            phrase.teaching?.originalText ||
            "声に出して、音とことばを一緒に追う。"
          }}
        </p>
      </section>

      <footer class="lesson-slide-progress">
        <span :style="{ width: `${progress * 100}%` }"></span>
      </footer>
    </article>
  </div>
</template>
