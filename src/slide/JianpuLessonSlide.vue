<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import FullSongProgress from "./FullSongProgress.vue";
import JianpuPhraseNotation from "./JianpuPhraseNotation.vue";
import {
  buildTeachingRubyTokens,
  DEFAULT_TEACHING_HIGHLIGHT_PALETTE,
  teachingSentenceFontSize
} from "./teachingPresentation";
import type {
  JianpuPhraseFrame,
  PhraseSlot,
  SongProgressSection,
  TeachingHighlightPalette,
  TeachingMark
} from "./types";

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
    credits?: string | readonly string[];
    tags?: readonly string[];
    phraseCount?: number;
    progressSections?: readonly SongProgressSection[];
    highlightPalette?: TeachingHighlightPalette;
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
    credits: "",
    tags: () => [],
    phraseCount: 1,
    progressSections: () => [],
    highlightPalette: () => ({})
  }
);

const emit = defineEmits<{
  "select-slot": [slot: PhraseSlot, index: number];
}>();

const viewport = ref<HTMLElement>();
const scale = ref(1);
let resizeObserver: ResizeObserver | undefined;

const phraseProgress = computed(() => {
  if (props.phrase.slots.length <= 1 || props.activeSlot < 0) return 0;
  return Math.min(1, props.activeSlot / (props.phrase.slots.length - 1));
});
const originalSentence = computed(() =>
  props.phrase.teaching?.originalText ||
  props.phrase.teaching?.surface ||
  props.phrase.lyricText ||
  props.phrase.normalizedText
);
const teachingReading = computed(() => props.phrase.teaching?.reading || props.phrase.normalizedText);
const originalSentenceStyle = computed(() => ({
  fontSize: `${teachingSentenceFontSize(originalSentence.value)}px`
}));
const teachingMarks = computed(() => props.phrase.teaching?.marks ?? []);
const rubyTokens = computed(() =>
  buildTeachingRubyTokens(
    originalSentence.value,
    teachingReading.value,
    props.phrase.teaching?.rubyTokens
  )
);
const rubyDisplayTokens = computed(() =>
  rubyTokens.value.map((token) => {
    const start = token.start ?? 0;
    const end = token.end ?? start + token.surface.length;
    const mark = teachingMarks.value.find((candidate) => {
      const markStart = candidate.start ?? originalSentence.value.indexOf(candidate.surface);
      const markEnd = candidate.end ?? markStart + candidate.surface.length;
      return markStart >= 0 && start < markEnd && end > markStart;
    });
    return {
      ...token,
      mark,
      color: mark ? markColor(mark) : undefined
    };
  })
);
const creditLines = computed(() => {
  const lines = (Array.isArray(props.credits) ? props.credits : [props.credits])
    .map((credit) => credit?.trim())
    .filter((credit): credit is string => Boolean(credit));
  const artist = props.artist.trim();
  if (artist && !lines.some((line) => line.includes(artist))) {
    lines.unshift(artist);
  }
  return lines;
});
const canvasStyle = computed(() => ({
  width: `${CANVAS_WIDTH}px`,
  height: `${CANVAS_HEIGHT}px`,
  transform: `scale(${scale.value})`
}));

function forwardSlot(slot: PhraseSlot, index: number): void {
  emit("select-slot", slot, index);
}

function markColor(mark: TeachingMark): string {
  return mark.color ||
    props.highlightPalette[mark.tone] ||
    DEFAULT_TEACHING_HIGHLIGHT_PALETTE[mark.tone];
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
        'is-continuation-slide': !showOpeningContext,
        'is-instrumental-slide': phrase.kind === 'instrumental'
      }"
      :data-phrase-id="phrase.id"
      :style="canvasStyle"
    >
      <header class="lesson-slide-header">
        <div class="lesson-song-heading">
          <span>
            <template v-if="sectionLabel">{{ sectionLabel }} · </template>
            {{ phrase.kind === "instrumental"
              ? phrase.normalizedText === "前奏" ? "INTRO" : "INSTRUMENTAL"
              : "JIANPU LESSON" }} ·
            {{ String(phrase.index + 1).padStart(2, "0") }}
          </span>
          <h1>{{ phrase.title }}</h1>
          <ul v-if="tags.length" class="lesson-song-tags" aria-label="乐曲标签">
            <li v-for="tag in tags" :key="tag">{{ tag }}</li>
          </ul>
        </div>
        <div class="lesson-source-anchor">
          <span>BAR {{ phrase.sourceAnchor.startMeasure }}–{{ phrase.sourceAnchor.endMeasure }}</span>
          <strong>
            1={{ phrase.keyOfOne }}<template v-if="phrase.tempo"> · BPM {{ phrase.tempo }}</template>
          </strong>
          <p v-if="creditLines.length" class="lesson-header-credits">
            {{ creditLines.join(" · ") }}
          </p>
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

      <section v-if="phrase.kind !== 'instrumental'" class="lesson-language-band">
        <div class="lesson-language-primary">
          <p class="lesson-original-sentence" :style="originalSentenceStyle">
            <span class="lesson-original-surface" data-teaching-original>
              <ruby
                v-for="token in rubyDisplayTokens"
                :key="token.id"
                class="lesson-ruby-token"
                :data-ruby-token-id="token.id"
              >
                <mark
                  v-if="token.mark"
                  class="teaching-highlight"
                  :class="`tone-${token.mark.tone}`"
                  :data-teaching-mark-id="token.mark.id"
                  :data-mark-tone="token.mark.tone"
                  :style="{ '--teaching-mark-color': token.color }"
                >{{ token.surface }}</mark>
                <span v-else>{{ token.surface }}</span>
                <rt v-if="token.reading">{{ token.reading }}</rt>
              </ruby>
            </span>
          </p>
          <p v-if="showRomaji && phrase.teaching?.romaji" class="lesson-romaji">{{ phrase.teaching.romaji }}</p>
          <p v-if="showTranslation && phrase.teaching?.translation" class="lesson-translation">
            {{ phrase.teaching.translation }}
          </p>
          <p
            v-if="teachingMarks.length && (annotation || phrase.teaching?.coachNote)"
            class="lesson-coach-note lesson-coach-note-inline"
          >
            {{ annotation || phrase.teaching?.coachNote }}
          </p>
        </div>

        <aside class="lesson-language-notes" aria-label="语法与词汇标注">
          <article
            v-for="mark in teachingMarks"
            :key="mark.id"
            class="lesson-language-note"
            :class="`tone-${mark.tone}`"
            :style="{ '--teaching-mark-color': markColor(mark) }"
            :data-teaching-mark-id="mark.id"
          >
            <strong>{{ mark.label }}</strong>
            <span>{{ mark.surface }}<template v-if="mark.reading">（{{ mark.reading }}）</template></span>
            <p>{{ mark.explanation || mark.reading }}</p>
          </article>
          <p
            v-if="!teachingMarks.length && (annotation || phrase.teaching?.coachNote)"
            class="lesson-coach-note lesson-coach-note-rail"
          >
            {{ annotation || phrase.teaching?.coachNote }}
          </p>
          <span
            v-else-if="!teachingMarks.length"
            class="lesson-language-notes-reserved"
            aria-hidden="true"
          ></span>
        </aside>
      </section>

      <section v-else class="lesson-interlude-band">
        <div>
          <span>ORIGINAL SONG SYNC</span>
          <strong>{{ phrase.normalizedText || "过门" }} · {{ phrase.measures.length }} 小节</strong>
        </div>
        <p>{{ annotation || phrase.teaching?.coachNote || "保持拍点，等待下一句进入。" }}</p>
      </section>

      <FullSongProgress
        :phrase-index="phrase.index"
        :phrase-count="phraseCount"
        :phrase-progress="phraseProgress"
        :sections="progressSections"
      />
    </article>
  </div>
</template>
