<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { NMNI18n, SparksNMN } from "@sparks-notation/core";
import { Equifield, type EquifieldSection } from "@sparks-notation/core/equifield/equifield";
import type { ScoreIR } from "../ir/score";
import type { TeachingLineInfo } from "../teaching/types";
import { createJPWHeaderField, isSparksHeaderField } from "./jpwHeaderField";
import { scoreIRToSparksNMN } from "./jpwabcToSparks";

const props = defineProps<{
  score: ScoreIR;
  zoom: number;
  pageMode: boolean;
  phraseMode: boolean;
  teachingGhost: boolean;
  showKeyChanges: boolean;
  activeLineIndex?: number;
}>();

const emit = defineEmits<{
  "render-error": [value: string];
  "conversion-warnings": [value: string[]];
  "sparks-issues": [value: string[]];
  "lines-ready": [value: TeachingLineInfo[]];
  "line-click": [value: TeachingLineInfo];
}>();

const rootRef = ref<HTMLDivElement | null>(null);
const errorText = ref("");
const loadedFonts = ref(false);
const fontProgress = ref("");
let equifield: Equifield | undefined;

const conversion = computed(() =>
  scoreIRToSparksNMN(props.score, { teachingGhost: props.teachingGhost, showKeyChanges: props.showKeyChanges })
);

function loadFonts(): Promise<void> {
  if (loadedFonts.value) return Promise.resolve();
  return new Promise((resolve) => {
    SparksNMN.fontLoader.requestFontLoad(
      "/sparks-core-resources/font",
      () => {
        loadedFonts.value = true;
        fontProgress.value = "";
        resolve();
      },
      (progress: number, total: number) => {
        fontProgress.value = `fonts ${progress}/${total}`;
      }
    );
  });
}

async function render(): Promise<void> {
  const root = rootRef.value;
  if (!root) return;

  try {
    errorText.value = "";
    emit("render-error", "");
    emit("sparks-issues", []);
    const conversionResult = conversion.value;
    emit("conversion-warnings", conversionResult.warnings);
    await loadFonts();
    await nextTick();
    equifield?.destroy();
    root.innerHTML = "";
    const parsed = SparksNMN.parse(conversionResult.source);
    emit("sparks-issues", formatSparksIssues(parsed.issues, conversionResult.source));
    let fields = SparksNMN.render(parsed.result, NMNI18n.languages.zh_cn) as EquifieldSection[];
    if (!props.phraseMode) {
      fields = SparksNMN.paginize(parsed.result, fields, NMNI18n.languages.zh_cn).result;
    }
    fields = [createJPWHeaderField(props.score), ...fields.filter((field) => !isSparksHeaderField(field))];
    equifield = new Equifield(root);
    equifield.render(fields);
    window.dispatchEvent(new Event("resize"));
    decorateTeachingLines();
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
    emit("conversion-warnings", conversion.value.warnings);
    emit("render-error", errorText.value);
  }
}

function decorateTeachingLines(): TeachingLineInfo[] {
  const root = rootRef.value;
  if (!root) return [];

  const rootRect = root.getBoundingClientRect();
  const lineElements = Array.from(root.querySelectorAll<HTMLElement>(".wcl-equifield-field")).filter((element) => {
    const kind: TeachingLineInfo["kind"] = element.querySelector(".jpw-header-field") ? "header" : "score";
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (props.phraseMode && kind === "score" && !text) {
      element.remove();
      return false;
    }
    return true;
  });

  const lines = lineElements.map((element, index) => {
    const kind: TeachingLineInfo["kind"] = element.querySelector(".jpw-header-field") ? "header" : "score";
    const rect = element.getBoundingClientRect();
    const info: TeachingLineInfo = {
      index,
      kind,
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
      top: rect.top - rootRect.top,
      height: rect.height
    };

    element.classList.add("jpw-teaching-line");
    element.classList.toggle("is-active", props.activeLineIndex === index);
    element.dataset.lineIndex = String(index);
    element.dataset.lineKind = kind;
    return info;
  });

  emit("lines-ready", lines);
  return lines;
}

function updateActiveTeachingLine(): void {
  const root = rootRef.value;
  if (!root) return;
  root.querySelectorAll<HTMLElement>(".jpw-teaching-line").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.lineIndex === String(props.activeLineIndex));
  });
}

function handleLineClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  const line = target?.closest(".jpw-teaching-line") as HTMLElement | null;
  if (!line) return;
  const index = Number(line.dataset.lineIndex);
  if (!Number.isFinite(index)) return;
  emit("line-click", {
    index,
    kind: line.dataset.lineKind === "header" ? "header" : "score",
    text: (line.textContent ?? "").replace(/\s+/g, " ").trim(),
    top: line.offsetTop,
    height: line.offsetHeight
  });
}

function formatSparksIssues(issues: unknown, source: string): string[] {
  if (!Array.isArray(issues)) return [];
  const lines = source.split(/\r\n?|\n/);
  return issues.map((issue) => {
    if (issue && typeof issue === "object") {
      const record = issue as Record<string, unknown>;
      const level =
        typeof record.severity === "string" ? record.severity : typeof record.level === "string" ? record.level : "issue";
      const code = typeof record.key === "string" ? record.key : typeof record.code === "string" ? record.code : "";
      const message =
        typeof record.defaultTranslation === "string"
          ? applyIssueArgs(record.defaultTranslation, record.args)
          : typeof record.message === "string"
            ? record.message
            : "";
      const raw = typeof record.raw === "string" ? record.raw : "";
      const lineNumber = typeof record.lineNumber === "number" ? record.lineNumber : undefined;
      const index = typeof record.index === "number" ? record.index : undefined;
      const line = lineNumber !== undefined ? compactIssueLine(lines[lineNumber - 1]?.trim() ?? "") : "";
      const position = [lineNumber !== undefined ? `line ${lineNumber}` : "", index !== undefined ? `index ${index}` : ""]
        .filter(Boolean)
        .join(" ");
      const parts = [level, code, position, message, raw, line ? `NMN: ${line}` : ""].filter(Boolean);
      if (parts.length) return parts.join(" · ");
    }

    return String(issue);
  });
}

function applyIssueArgs(template: string, args: unknown): string {
  if (!Array.isArray(args)) return template;
  return args.reduce((text, arg, index) => text.replaceAll(`\${${index}}`, String(arg)), template);
}

function compactIssueLine(line: string): string {
  const maxLength = 220;
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength - 1)}...`;
}

watch(() => [props.score, props.zoom, props.pageMode, props.phraseMode, props.teachingGhost, props.showKeyChanges], () => {
  void render();
});

watch(() => props.activeLineIndex, () => {
  updateActiveTeachingLine();
});

onMounted(() => {
  void render();
});

onBeforeUnmount(() => {
  equifield?.destroy();
});
</script>

<template>
  <div class="sparks-viewer" :class="{ 'page-mode': pageMode, 'phrase-mode': phraseMode }" :style="{ '--sparks-zoom': String(zoom) }">
    <div class="sparks-page-shell" @click="handleLineClick">
      <div ref="rootRef" class="sparks-equifield"></div>
      <div v-if="fontProgress" class="sparks-status">{{ fontProgress }}</div>
    </div>
  </div>
</template>
