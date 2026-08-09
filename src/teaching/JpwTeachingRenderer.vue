<script setup lang="ts">
import { computed } from "vue";
import type { Diagnostic } from "../core/diagnostics";
import type { ScoreIR } from "../ir/score";
import { parseJPWABC } from "../parser/parseJPWABC";
import SparksScoreView from "../sparks/SparksScoreView.vue";
import type { TeachingLineInfo } from "./types";

const props = withDefaults(
  defineProps<{
    score?: ScoreIR | null;
    sourceText?: string;
    zoom?: number;
    pageMode?: boolean;
    phraseMode?: boolean;
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
    phraseMode: false,
    teachingGhost: true,
    showKeyChanges: true,
    activeLineIndex: undefined,
    showDiagnostics: true
  }
);

const emit = defineEmits<{
  "render-error": [value: string];
  "conversion-warnings": [value: string[]];
  "sparks-issues": [value: string[]];
  "lines-ready": [value: TeachingLineInfo[]];
  "line-click": [value: TeachingLineInfo];
}>();

interface ParsedInput {
  score: ScoreIR | null;
  parseError: string;
  diagnostics: Diagnostic[];
}

const parsedInput = computed<ParsedInput>(() => {
  if (props.score) {
    return {
      score: props.score,
      parseError: "",
      diagnostics: props.score.diagnostics
    };
  }

  if (!props.sourceText.trim()) {
    return {
      score: null,
      parseError: "",
      diagnostics: []
    };
  }

  try {
    const parsed = parseJPWABC(props.sourceText);
    return {
      score: parsed.value,
      parseError: "",
      diagnostics: parsed.value.diagnostics
    };
  } catch (error) {
    return {
      score: null,
      parseError: error instanceof Error ? error.message : String(error),
      diagnostics: []
    };
  }
});

const issueRows = computed(() => {
  const rows = parsedInput.value.diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    code: diagnostic.code,
    text: diagnostic.raw || diagnostic.message
  }));

  if (parsedInput.value.parseError) {
    rows.unshift({
      severity: "error" as const,
      code: "PARSE_ERROR",
      text: parsedInput.value.parseError
    });
  }

  return rows;
});
</script>

<template>
  <section class="jpw-teaching-renderer">
    <SparksScoreView
      v-if="parsedInput.score"
      :score="parsedInput.score"
      :zoom="zoom"
      :page-mode="pageMode"
      :phrase-mode="phraseMode"
      :teaching-ghost="teachingGhost"
      :show-key-changes="showKeyChanges"
      :active-line-index="activeLineIndex"
      @render-error="emit('render-error', $event)"
      @conversion-warnings="emit('conversion-warnings', $event)"
      @sparks-issues="emit('sparks-issues', $event)"
      @lines-ready="emit('lines-ready', $event)"
      @line-click="emit('line-click', $event)"
    />

    <section v-if="showDiagnostics && issueRows.length" class="jpw-teaching-diagnostics" aria-live="polite">
      <strong>JPWABC diagnostics · {{ issueRows.length }}</strong>
      <p v-for="(issue, index) in issueRows.slice(0, 20)" :key="`${issue.code}-${index}`">
        <span>{{ issue.severity }}</span>
        <span>{{ issue.code }}</span>
        <code>{{ issue.text }}</code>
      </p>
    </section>
  </section>
</template>
