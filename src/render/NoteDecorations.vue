<script setup lang="ts">
import { computed } from "vue";
import type { Accidental, NoteDecorationsIR } from "../ir/voice";
import type { EngravingStyle } from "../notation/engravingGeometry";
import { noteDecorations } from "../notation/noteDecorations";
import { JPW_DIGIT_GLYPHS } from "./glyphs/jpwScoreGlyphs";
import { PRINT_GLYPH_SCALE } from "../notation/notationProfiles";

const props = defineProps<{ note: NoteDecorationsIR & { octave?: number; accidental?: Accidental; degree?: number }; x: number; y: number;
  engraving: EngravingStyle; print?: boolean }>();
const layout = computed(() => noteDecorations(props.note, props.x, props.y, props.engraving, props.print));
</script>

<template>
  <g class="note-decorations" fill="currentColor" aria-hidden="true">
    <g v-for="(digit, i) in layout.digits" :key="i" class="grace-note">
      <path v-if="print" :d="JPW_DIGIT_GLYPHS[digit.note.degree]?.d"
        :transform="`translate(${digit.x} ${digit.y}) scale(${PRINT_GLYPH_SCALE * 0.59})`" />
      <text v-else class="phrase-digit" :x="digit.x" :y="digit.y" :style="{ fontSize: `${layout.size}px` }">{{ digit.note.degree }}</text>
    </g>
    <circle v-for="(dot, i) in layout.dots" :key="`dot-${i}`" class="grace-dot" :cx="dot.cx" :cy="dot.cy" :r="dot.r" />
    <path v-for="(accidental, i) in layout.accidentals" :key="`acc-${i}`" class="grace-accidental"
      :d="accidental.d" :transform="accidental.transform" />
    <rect v-for="(beam, i) in layout.beams" :key="`beam-${i}`" class="grace-beam"
      :x="beam.x" :y="beam.y" :width="beam.w" :height="beam.h" />
    <path v-if="layout.hook" class="grace-hook" :d="layout.hook" fill="none" stroke="currentColor" :stroke-width="layout.hookWidth" />
    <path v-for="(ornament, i) in layout.ornaments" :key="i" :class="`ornament-${ornament.kind}`"
      :d="ornament.d" :transform="ornament.transform" />
  </g>
</template>
