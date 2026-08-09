<script setup lang="ts">
import type { ScoreIR } from "../ir/score";
import JpwTeachingRenderer from "./JpwTeachingRenderer.vue";
import type { TeachingLineInfo } from "./types";

withDefaults(
  defineProps<{
    score?: ScoreIR | null;
    sourceText?: string;
    zoom?: number;
    pageMode?: boolean;
    teachingGhost?: boolean;
    showKeyChanges?: boolean;
    activeLineIndex?: number;
    showDiagnostics?: boolean;
  }>(),
  {
    score: null,
    sourceText: "",
    zoom: 1,
    pageMode: false,
    teachingGhost: true,
    showKeyChanges: true,
    activeLineIndex: undefined,
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
</script>

<template>
  <JpwTeachingRenderer
    v-bind="$props"
    :phrase-mode="true"
    @render-error="$emit('render-error', $event)"
    @conversion-warnings="$emit('conversion-warnings', $event)"
    @sparks-issues="$emit('sparks-issues', $event)"
    @lines-ready="$emit('lines-ready', $event)"
    @line-click="$emit('line-click', $event)"
  />
</template>
