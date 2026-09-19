<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  findNextPlayablePhraseIndex,
  firstPerformedSlotIndex,
  isPerformedSlot,
  nextPerformedSlotIndex,
  nextPlaybackDeadline,
  playbackDelayMilliseconds,
  slotDurationMilliseconds
} from "../slide/playback";
import { buildSongProgressSections } from "../slide/teachingPresentation";
import type { PhraseSlot } from "../slide/types";
import {
  SONG_SECTION_PRESETS,
  formatProjectCredits,
  resolvePhraseSection
} from "./projectBuilder";
import { buildRenderableProjectPhrase } from "./projectPhraseSemantics";
import { loadTeachingProjectLocally } from "./projectStore";
import SlidevJianpuPhrase from "./SlidevJianpuPhrase.vue";
import type { TeachingProject } from "./types";
import "../slide/slide.css";
import "./projectPlayer.css";
import AppHeader from "../ui/AppHeader.vue";

const route = useRoute();
const router = useRouter();
const project = ref<TeachingProject>();
const status = ref("正在读取本机工程");
const activeSlot = ref(-1);
const playing = ref(false);
const autoAdvance = ref(true);
const omitMarkedPhrases = ref(false);
const teachingGhost = ref(true);
const showKeyChanges = ref(true);
let playTimer: number | undefined;
let awaitingPhraseAdvance = false;
let playbackDeadline: number | undefined;

function routeParamText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const projectId = computed(() => routeParamText(route.params.projectId));
const phraseIndex = computed(() => {
  const raw = routeParamText(route.params.phraseIndex);
  return /^\d+$/.test(raw) ? Number(raw) : 0;
});
const phrase = computed(() => project.value?.phrases[phraseIndex.value]);
const credits = computed(() =>
  project.value ? formatProjectCredits(project.value) : ""
);
const sectionPresets = computed(() => [
  ...SONG_SECTION_PRESETS,
  ...(project.value?.customSections ?? [])
]);
const sectionLabel = computed(() => {
  const currentProject = project.value;
  if (!currentProject || phrase.value?.kind === "instrumental") return "";
  const section = resolvePhraseSection(currentProject, phraseIndex.value);
  return sectionPresets.value.find((entry) => entry.id === section)?.label ?? section ?? "";
});
const progressSections = computed(() => {
  const currentProject = project.value;
  if (!currentProject) return [];
  return buildSongProgressSections(
    currentProject.phrases.map((candidate) => candidate.id),
    Object.fromEntries(
      currentProject.sectionBreaks.map((entry) => [entry.phraseId, entry.section])
    ),
    (section) =>
      sectionPresets.value.find((entry) => entry.id === section)?.label ?? section
  );
});
const renderedPhrase = computed(() => {
  const currentProject = project.value;
  const currentPhrase = phrase.value;
  if (!currentProject || !currentPhrase || currentPhrase.kind === "blank") {
    return undefined;
  }
  return buildRenderableProjectPhrase({
    phrase: currentPhrase.frame,
    voiceLine: currentPhrase.voiceLine,
    lyricText: currentPhrase.lyricText,
    lyricJpwabc: currentPhrase.lyricJpwabc,
    lyricCells: currentPhrase.lyricCells,
    referenceReading: currentPhrase.referenceReading,
    morphology: currentPhrase.morphology,
    keyOfOne: currentPhrase.keyOfOne,
    keyChanges: currentPhrase.keyChanges,
    title: currentProject.title,
    keyAndMeters: currentProject.keyAndMeters,
    expression: currentProject.expression,
    annotation: currentPhrase.annotation,
    phraseIndex: phraseIndex.value
  });
});
const performedSlotIndexes = computed(() =>
  (renderedPhrase.value?.slots ?? []).flatMap((slot, index) =>
    isPerformedSlot(slot) ? [index] : []
  )
);
const timelineSlotPosition = computed({
  get: () => Math.max(0, performedSlotIndexes.value.indexOf(activeSlot.value)),
  set: (position: number) => {
    const index = Math.max(
      0,
      Math.min(Math.round(position), performedSlotIndexes.value.length - 1)
    );
    activeSlot.value = performedSlotIndexes.value[index] ?? -1;
  }
});

function loadProject(id: string): void {
  stopPlayback();
  project.value = id ? loadTeachingProjectLocally(id) : undefined;
  if (!project.value) {
    status.value = "这个工程不在本机存储中，可返回编辑器恢复或重新导入。";
    return;
  }
  status.value = `${project.value.title} · ${project.value.phrases.length} 个乐句`;
  if (phraseIndex.value >= project.value.phrases.length && project.value.phrases.length) {
    void router.replace({
      name: "project-phrase",
      params: {
        projectId: project.value.id,
        phraseIndex: project.value.phrases.length - 1
      }
    });
  }
  resetActiveSlot();
}

function setPhrase(index: number): void {
  stopPlayback();
  const count = project.value?.phrases.length ?? 0;
  if (!count) return;
  const nextIndex = Math.max(0, Math.min(index, count - 1));
  void router.push({
    name: "project-phrase",
    params: { projectId: projectId.value, phraseIndex: nextIndex }
  });
}

function selectSlot(slot: PhraseSlot, index: number): void {
  if (isPerformedSlot(slot)) activeSlot.value = index;
}

function resetActiveSlot(): void {
  activeSlot.value = firstPerformedSlotIndex(renderedPhrase.value?.slots ?? []);
}

function togglePlayback(): void {
  if (playing.value) {
    stopPlayback();
    return;
  }
  playing.value = true;
  playbackDeadline = undefined;
  if (phrase.value?.skipDuringPlayback && omitMarkedPhrases.value) {
    advancePlayback();
    return;
  }
  scheduleNextSlot();
}

function scheduleNextSlot(): void {
  const frame = renderedPhrase.value;
  if (!playing.value) return;
  if (!frame?.slots.length) {
    advancePlayback();
    return;
  }
  if (activeSlot.value < 0 || !isPerformedSlot(frame.slots[activeSlot.value]!)) {
    resetActiveSlot();
  }
  const current = frame.slots[activeSlot.value];
  if (!current) {
    advancePlayback();
    return;
  }
  const bpm = Number(frame.tempo || 73);
  const now = performance.now();
  playbackDeadline = nextPlaybackDeadline(
    playbackDeadline,
    now,
    slotDurationMilliseconds(current, bpm)
  );
  playTimer = window.setTimeout(() => {
    const nextSlot = nextPerformedSlotIndex(frame.slots, activeSlot.value);
    if (nextSlot >= 0) {
      activeSlot.value = nextSlot;
      scheduleNextSlot();
    } else if (autoAdvance.value) {
      advancePlayback();
    } else {
      stopPlayback();
    }
  }, playbackDelayMilliseconds(playbackDeadline, now));
}

function advancePlayback(): void {
  const phrases = project.value?.phrases ?? [];
  const nextIndex = findNextPlayablePhraseIndex(
    phrases,
    phraseIndex.value,
    omitMarkedPhrases.value,
    (candidate) => candidate.skipDuringPlayback
  );
  if (nextIndex < 0) {
    stopPlayback();
    return;
  }
  awaitingPhraseAdvance = true;
  activeSlot.value = -1;
  void router.push({
    name: "project-phrase",
    params: { projectId: projectId.value, phraseIndex: nextIndex }
  });
}

function stopPlayback(): void {
  playing.value = false;
  awaitingPhraseAdvance = false;
  playbackDeadline = undefined;
  if (playTimer !== undefined) window.clearTimeout(playTimer);
  playTimer = undefined;
}

watch(projectId, loadProject, { immediate: true });
watch([phrase, renderedPhrase], () => {
  resetActiveSlot();
  if (playing.value && awaitingPhraseAdvance) {
    awaitingPhraseAdvance = false;
    void nextTick().then(scheduleNextSlot);
  }
});
onBeforeUnmount(stopPlayback);
</script>

<template>
  <AppHeader section="teaching" />
  <main class="slide-studio project-player">
    <header class="studio-header">
      <div>
        <span class="studio-kicker">LOCAL TEACHING PROJECT</span>
        <h1>{{ project?.title || "本机教学工程" }}</h1>
        <p>{{ status }}</p>
      </div>
      <div class="studio-header-actions">
        <RouterLink
          v-if="project"
          class="legacy-link"
          :to="{ name: 'project-edit', params: { projectId: project.id } }"
        >
          编辑当前工程
        </RouterLink>
        <RouterLink class="legacy-link" :to="{ name: 'project-new' }">
          新建教学工程
        </RouterLink>
      </div>
    </header>

    <section v-if="project?.phrases.length" class="studio-toolbar" aria-label="工程播放控制">
      <div class="phrase-stepper">
        <button type="button" title="上一句" aria-label="上一句" @click="setPhrase(phraseIndex - 1)">‹</button>
        <strong>{{ phraseIndex + 1 }} / {{ project.phrases.length }}</strong>
        <button type="button" title="下一句" aria-label="下一句" @click="setPhrase(phraseIndex + 1)">›</button>
      </div>
      <button class="play-button" type="button" :title="playing ? '暂停' : '播放'" :aria-label="playing ? '暂停' : '播放'" @click="togglePlayback">
        {{ playing ? "Ⅱ" : "▶" }}
      </button>
      <label class="timeline-control">
        <span>时间轴</span>
        <input
          v-model.number="timelineSlotPosition"
          type="range"
          min="0"
          :max="Math.max(0, performedSlotIndexes.length - 1)"
          step="1"
        />
      </label>
      <label class="studio-toggle"><input v-model="teachingGhost" type="checkbox" /> Tie ghost</label>
      <label class="studio-toggle"><input v-model="showKeyChanges" type="checkbox" /> 转调</label>
      <label class="studio-toggle"><input v-model="autoAdvance" type="checkbox" /> 自动翻页</label>
      <label class="studio-toggle"><input v-model="omitMarkedPhrases" type="checkbox" /> 省略已标记过门</label>
    </section>

    <div v-if="project?.phrases.length" class="studio-workspace">
      <nav class="phrase-list" aria-label="工程乐句列表">
        <button
          v-for="(candidate, index) in project.phrases"
          :key="candidate.id"
          type="button"
          :class="{
            'is-selected': index === phraseIndex,
            'is-instrumental': candidate.kind === 'instrumental'
          }"
          @click="setPhrase(index)"
        >
          <span>{{ String(index + 1).padStart(2, "0") }}</span>
          <strong>{{ candidate.lyricText || candidate.annotation || (candidate.kind === "instrumental" ? "过门" : "空白页") }}</strong>
          <small>{{ candidate.kind }}</small>
        </button>
      </nav>

      <section class="stage-column">
        <div class="stage-meta">
          <span>{{ sectionLabel || phrase?.kind || "PHRASE" }}</span>
          <span>{{ renderedPhrase?.slots.length ?? 0 }} slots</span>
          <span>本机自动保存工程</span>
        </div>
        <div class="slide-stage">
          <SlidevJianpuPhrase
            v-if="phrase"
            :phrase="renderedPhrase"
            :voice-line="phrase.kind === 'blank' ? '' : phrase.voiceLine"
            :lyric-text="phrase.lyricText"
            :lyric-jpwabc="phrase.lyricJpwabc"
            :lyric-cells="phrase.lyricCells"
            :reference-reading="phrase.referenceReading"
            :morphology="phrase.morphology"
            :key-of-one="phrase.keyOfOne"
            :key-changes="phrase.keyChanges"
            :title="project.title"
            :artist="project.artist"
            :credits="credits"
            :tags="project.tags"
            :key-and-meters="project.keyAndMeters"
            :expression="project.expression"
            :section="sectionLabel"
            :annotation="phrase.annotation"
            :active-slot="activeSlot"
            :teaching-ghost="teachingGhost"
            :show-metronome="phrase.showMetronome"
            :show-key-changes="showKeyChanges"
            :phrase-index="phraseIndex"
            :phrase-count="project.phrases.length"
            :progress-sections="progressSections"
            @select-slot="selectSlot"
          />
        </div>
      </section>
    </div>

    <section v-else class="project-player-empty">
      <h2>{{ project ? "这个工程还没有乐句" : "工程未找到" }}</h2>
      <p>{{ status }}</p>
      <RouterLink class="legacy-link" :to="{ name: 'project-new' }">返回工程编辑器</RouterLink>
    </section>
  </main>
</template>
