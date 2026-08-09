<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { JianpuPhraseFrame } from "./types";
import {
  SMUFL_GLYPHS,
  splitKeyOfOne,
  timeSignatureText
} from "../notation/smufl";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const props = defineProps<{
  phrase: JianpuPhraseFrame;
  subtitle?: string;
  artist?: string;
}>();

const viewport = ref<HTMLElement>();
const scale = ref(1);
let resizeObserver: ResizeObserver | undefined;

const keyParts = computed(() => splitKeyOfOne(props.phrase.keyOfOne));
const titleClass = computed(() => {
  const length = [...props.phrase.title].length;
  if (length <= 4) return "is-short";
  if (length >= 14) return "is-long";
  return "";
});
const canvasStyle = computed(() => ({
  width: `${CANVAS_WIDTH}px`,
  height: `${CANVAS_HEIGHT}px`,
  transform: `scale(${scale.value})`
}));

function updateScale(): void {
  const width = viewport.value?.clientWidth ?? CANVAS_WIDTH;
  scale.value = width > 0 ? width / CANVAS_WIDTH : 1;
}

onMounted(() => {
  updateScale();
  resizeObserver = new ResizeObserver(updateScale);
  if (viewport.value) resizeObserver.observe(viewport.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div ref="viewport" class="jianpu-slide-viewport">
    <article class="jianpu-title-slide" :style="canvasStyle">
      <header class="title-slide-topline">
        <span>JIANPU TEACHING SCORE</span>
        <span v-if="artist">{{ artist }}</span>
      </header>

      <main class="title-slide-main">
        <h1 :class="titleClass">{{ phrase.title }}</h1>
        <p v-if="subtitle" class="title-slide-subtitle">{{ subtitle }}</p>

        <section class="title-musical-context" aria-label="调号、拍号、速度与表情">
          <div class="title-key-mark" aria-label="调号">
            <span>1 =</span>
            <span v-if="keyParts.accidental" class="title-smufl title-key-accidental">
              {{ keyParts.accidental }}
            </span>
            <strong>{{ keyParts.letter }}</strong>
          </div>

          <div class="title-meter-mark" aria-label="拍号">
            <span class="title-smufl">{{ timeSignatureText(phrase.titleMeter.numerator) }}</span>
            <i></i>
            <span class="title-smufl">{{ timeSignatureText(phrase.titleMeter.denominator) }}</span>
          </div>

          <div v-if="phrase.tempo" class="title-tempo-mark" aria-label="速度">
            <span class="title-smufl">{{ SMUFL_GLYPHS.metronomeQuarterUp }}</span>
            <strong>= {{ phrase.tempo }}</strong>
          </div>

          <p v-if="phrase.expression" class="title-expression">{{ phrase.expression }}</p>
        </section>
      </main>

      <footer class="title-slide-footer">
        <span>JPW-ABC · SVG</span>
        <span>01</span>
      </footer>
    </article>
  </div>
</template>
