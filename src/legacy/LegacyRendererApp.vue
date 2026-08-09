<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ScoreViewer from "../screen/ScoreViewer.vue";
import { decodeJPWABCWithInfo } from "../core/decode";
import { parseJPWABC } from "../parser/parseJPWABC";
import type { ScoreIR } from "../ir/score";
import type { Diagnostic } from "../core/diagnostics";
import { findFixture } from "../demo/fixtures";

const route = useRoute();
const router = useRouter();

function routeParamText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const scoreId = computed({
  get: () => findFixture(routeParamText(route.params.scoreId) || "sakura").id,
  set: (id: string) => {
    void router.push({
      name: editorOpen.value ? "legacy-edit" : "legacy",
      params: { scoreId: findFixture(id).id },
      query: route.query
    });
  }
});
const editorOpen = computed({
  get: () => route.name === "legacy-edit",
  set: (open: boolean) => {
    void router.push({
      name: open ? "legacy-edit" : "legacy",
      params: { scoreId: scoreId.value },
      query: route.query
    });
  }
});
const score = ref<ScoreIR | null>(null);
const status = ref("Loading");
const encoding = ref("");
const sourceText = ref("");
const sourceLabel = ref("");
const parseError = ref("");
let parseTimer: number | undefined;

const diagnostics = computed<Diagnostic[]>(() => score.value?.diagnostics ?? []);
const editorStats = computed(() => {
  const lineCount = sourceText.value ? sourceText.value.split(/\r\n?|\n/).length : 0;
  return `${lineCount} lines · ${sourceText.value.length} chars`;
});

async function loadScore(id: string): Promise<void> {
  const fixture = findFixture(id);
  status.value = `Loading ${fixture.label}`;
  score.value = null;
  try {
    const response = await fetch(fixture.path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    const decoded = decodeJPWABCWithInfo(buffer);
    sourceLabel.value = fixture.label;
    encoding.value = decoded.encoding;
    const previousText = sourceText.value;
    sourceText.value = decoded.text;
    if (previousText === decoded.text) scheduleParse();
  } catch (err) {
    status.value = err instanceof Error ? err.message : String(err);
  }
}

function parseCurrentSource(): void {
  try {
    parseError.value = "";
    const parsed = parseJPWABC(sourceText.value);
    score.value = parsed.value;
    const label = sourceLabel.value || "Custom JPWABC";
    const sourceEncoding = encoding.value || "text";
    status.value = `${label} · ${sourceEncoding} · ${parsed.value.diagnostics.length} diagnostics`;
  } catch (err) {
    parseError.value = err instanceof Error ? err.message : String(err);
    status.value = parseError.value;
  }
}

function scheduleParse(): void {
  if (parseTimer !== undefined) window.clearTimeout(parseTimer);
  parseTimer = window.setTimeout(parseCurrentSource, 120);
}

function editSource(value: string): void {
  sourceLabel.value = "Custom JPWABC";
  encoding.value = "text";
  sourceText.value = value;
}

function reloadSelectedScore(): void {
  void loadScore(scoreId.value);
}

watch(scoreId, (id) => void loadScore(id), { immediate: true });

watch(sourceText, () => {
  scheduleParse();
});

onBeforeUnmount(() => {
  if (parseTimer !== undefined) window.clearTimeout(parseTimer);
});
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <h1>Music Teach · JPW-ABC Legacy Renderer</h1>
        <p>{{ status }}</p>
      </div>
      <div class="header-actions">
        <label class="editor-toggle">
          <input v-model="editorOpen" type="checkbox" />
          Editor
        </label>
        <span class="encoding-pill">{{ encoding || "..." }}</span>
      </div>
    </header>
    <div class="workspace" :class="{ 'with-editor': editorOpen }">
      <aside v-if="editorOpen" class="jpwabc-editor-pane">
        <div class="editor-head">
          <div>
            <h2>JPWABC</h2>
            <p>{{ editorStats }}</p>
          </div>
          <button type="button" class="editor-reset-button" @click="reloadSelectedScore">Reset</button>
        </div>
        <textarea
          class="jpwabc-editor"
          spellcheck="false"
          :value="sourceText"
          @input="editSource(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <div class="editor-diagnostics" :class="{ 'has-error': parseError || diagnostics.some((diagnostic) => diagnostic.severity === 'error') }">
          <strong>{{ parseError ? "Parse error" : `${diagnostics.length} diagnostics` }}</strong>
          <p v-if="parseError">{{ parseError }}</p>
          <p v-for="diagnostic in diagnostics.slice(0, 8)" :key="`${diagnostic.code}-${diagnostic.raw ?? diagnostic.message}`">
            {{ diagnostic.severity }} · {{ diagnostic.code }} · {{ diagnostic.raw || diagnostic.message }}
          </p>
        </div>
      </aside>
      <ScoreViewer :score="score" :score-id="scoreId" :parse-error="parseError" @update:score-id="scoreId = $event" />
    </div>
  </main>
</template>
