<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Diagnostic } from "../core/diagnostics";
import type { ScoreIR } from "../ir/score";
import type { TeachingLineInfo } from "../teaching";
import Toolbar from "./Toolbar.vue";
import JpwTeachingRenderer from "../teaching/JpwTeachingRenderer.vue";

const props = defineProps<{
  score: ScoreIR | null;
  scoreId: string;
  parseError?: string;
}>();

const emit = defineEmits<{
  "update:scoreId": [value: string];
}>();

const route = useRoute();
const router = useRouter();
const zoom = ref(0.92);
const pageMode = ref(false);
const phraseMode = ref(route.query.phrase === "1");
const teachingGhost = ref(true);
const showKeyChanges = ref(true);
const showReadingOverrides = ref(true);
const hoverText = ref("");
const renderError = ref("");
const conversionWarnings = ref<string[]>([]);
const sparksIssues = ref<string[]>([]);
const activeLineIndex = ref<number | undefined>();

interface BottomIssue {
  severity: Diagnostic["severity"];
  source: string;
  code: string;
  text: string;
}

const bottomIssues = computed<BottomIssue[]>(() => {
  const issues: BottomIssue[] = [];

  if (props.parseError) {
    issues.push({
      severity: "error",
      source: "JPWABC",
      code: "PARSE_ERROR",
      text: props.parseError
    });
  }

  if (renderError.value) {
    issues.push({
      severity: "error",
      source: "Renderer",
      code: "RENDER_ERROR",
      text: renderError.value
    });
  }

  props.score?.diagnostics.forEach((diagnostic) => {
    issues.push({
      severity: diagnostic.severity,
      source: "JPWABC",
      code: diagnostic.code,
      text: diagnostic.raw || diagnostic.message
    });
  });

  conversionWarnings.value.forEach((warning) => {
    issues.push({
      severity: "warning",
      source: "Sparks",
      code: "CONVERSION_WARNING",
      text: warning
    });
  });

  sparksIssues.value.forEach((issue) => {
    issues.push({
      severity: issue.startsWith("error") ? "error" : "warning",
      source: "Sparks",
      code: "PARSE_ISSUE",
      text: issue
    });
  });

  return issues;
});

function onPointerMove(event: PointerEvent): void {
  if (!props.score) return;
  const target = event.target as Element | null;
  const hit = target?.closest("[data-event-id], [data-lyric-cell-id]") as HTMLElement | null;
  if (!hit) {
    hoverText.value = "";
    return;
  }
  const eventId = hit.dataset.eventId;
  const cellId = hit.dataset.lyricCellId;

  if (cellId) {
    const cell = props.score.lyrics.flatMap((block) => block.cells).find((candidate) => candidate.id === cellId);
    hoverText.value = cell ? `lyric ${cell.kind}: ${cell.raw}` : "";
    return;
  }

  const voiceEvent = props.score.voices[0]?.events.find((candidate) => candidate.id === eventId);
  if (!voiceEvent) {
    hoverText.value = "";
    return;
  }

  if (voiceEvent.kind === "note") {
    hoverText.value = `${voiceEvent.raw} · pitch ${voiceEvent.pitchKey} · u${voiceEvent.duration.underlines} d${voiceEvent.duration.dashes} .${voiceEvent.duration.dots}`;
  } else if (voiceEvent.kind === "rhythm") {
    hoverText.value = `${voiceEvent.raw} · rhythm X · lyric-alignable`;
  } else {
    hoverText.value = `${voiceEvent.kind}: ${voiceEvent.raw}`;
  }
}

function onLineClick(line: TeachingLineInfo): void {
  activeLineIndex.value = line.index;
  hoverText.value = line.kind === "header" ? "表头行" : `教学行 ${line.index}`;
}

watch(phraseMode, (enabled) => {
  const query = { ...route.query };
  if (enabled) query.phrase = "1";
  else delete query.phrase;
  void router.replace({ query });
});

</script>

<template>
  <section class="score-viewer">
    <Toolbar
      :score-id="scoreId"
      :zoom="zoom"
      :page-mode="pageMode"
      :phrase-mode="phraseMode"
      :teaching-ghost="teachingGhost"
      :show-key-changes="showKeyChanges"
      :show-reading-overrides="showReadingOverrides"
      @update:score-id="emit('update:scoreId', $event)"
      @update:zoom="zoom = $event"
      @update:page-mode="pageMode = $event"
      @update:phrase-mode="phraseMode = $event"
      @update:teaching-ghost="teachingGhost = $event"
      @update:show-key-changes="showKeyChanges = $event"
      @update:show-reading-overrides="showReadingOverrides = $event"
    />

    <div class="hover-panel" aria-live="polite">{{ hoverText || " " }}</div>

    <div v-if="score" class="viewer-body" @pointermove="onPointerMove" @pointerleave="hoverText = ''">
      <JpwTeachingRenderer
        :score="score"
        :zoom="zoom"
        :page-mode="pageMode"
        :phrase-mode="phraseMode"
        :teaching-ghost="teachingGhost"
        :show-key-changes="showKeyChanges"
        :active-line-index="activeLineIndex"
        :show-diagnostics="false"
        @render-error="renderError = $event"
        @conversion-warnings="conversionWarnings = $event"
        @sparks-issues="sparksIssues = $event"
        @line-click="onLineClick"
      />
    </div>

    <section v-if="bottomIssues.length" class="render-issue-panel" aria-live="polite">
      <strong>渲染/解析问题 · {{ bottomIssues.length }}</strong>
      <div class="render-issue-list">
        <p
          v-for="(issue, index) in bottomIssues.slice(0, 40)"
          :key="`${issue.source}-${issue.code}-${index}`"
          :class="`issue-${issue.severity}`"
        >
          <span>{{ issue.severity }}</span>
          <span>{{ issue.source }}</span>
          <span>{{ issue.code }}</span>
          <code>{{ issue.text }}</code>
        </p>
      </div>
      <p v-if="bottomIssues.length > 40" class="render-issue-more">还有 {{ bottomIssues.length - 40 }} 条，先收起。</p>
    </section>
  </section>
</template>
