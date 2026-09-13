<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import "./slide.css";
import { decodeJPWABCWithInfo } from "../core/decode";
import { demoFixtures, findFixture } from "../demo/fixtures";
import { parseJPWABC } from "../parser/parseJPWABC";
import type { ScoreIR } from "../ir/score";
import { buildLessonDeck } from "./buildLessonDeck";
import JianpuLessonSlide from "./JianpuLessonSlide.vue";
import JianpuTitleSlide from "./JianpuTitleSlide.vue";
import type { JianpuLessonDeck, PhraseSlot } from "./types";
import { buildSongProgressSections } from "./teachingPresentation";
import {
  findNextPlayablePhraseIndex,
  firstPerformedSlotIndex,
  isPerformedSlot,
  nextPerformedSlotIndex,
  nextPlaybackDeadline,
  playbackDelayMilliseconds,
  slotDurationMilliseconds
} from "./playback";
import {
  SONG_SECTION_PRESETS,
  createCustomSectionPreset
} from "../project/projectBuilder";
import type { SectionId, SongSectionPreset } from "../project/types";
import { convertParsedScoreToTeachingProject } from "../project/jpwabcProject";
import { downloadTeachingProject } from "../project/projectExport";

const route = useRoute();
const router = useRouter();

function routeParamText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const scoreId = computed({
  get: () => findFixture(routeParamText(route.params.scoreId) || "sakura").id,
  set: (id: string) => {
    const canonicalId = findFixture(id).id;
    void router.push({
      name: route.name === "score-sections" ? "score-sections" : "score",
      params: { scoreId: canonicalId }
    });
  }
});
const phraseIndex = computed(() => {
  if (route.name !== "phrase") return -1;
  const raw = routeParamText(route.params.phraseIndex);
  return /^\d+$/.test(raw) ? Number(raw) : -1;
});
const activeSlot = ref(-1);
const score = ref<ScoreIR | null>(null);
const deck = ref<JianpuLessonDeck | null>(null);
const status = ref("Loading");
const playing = ref(false);
const showRomaji = ref(true);
const showTranslation = ref(true);
const showBeatPulse = ref(true);
const showKeyChanges = ref(true);
const teachingGhost = ref(true);
const autoAdvance = ref(true);
const omitMarkedPhrases = ref(true);
let playTimer: number | undefined;
let awaitingPhraseAdvance = false;
let playbackDeadline: number | undefined;

interface PhrasePresentationSettings {
  annotation: string;
  showMetronome: boolean;
  skipDuringPlayback: boolean;
}

const phraseSettings = ref<Record<string, PhrasePresentationSettings>>({});
const sectionBreaks = ref<Record<string, SectionId>>({});
const customSections = ref<SongSectionPreset[]>([]);
const customSectionName = ref("");

const isSectionMap = computed(() => route.name === "score-sections");
const isTitleSlide = computed(() => phraseIndex.value < 0);
const titlePhrase = computed(() => deck.value?.phrases[0]);
const phrase = computed(() =>
  phraseIndex.value < 0 ? undefined : deck.value?.phrases[phraseIndex.value]
);
const performedSlotIndexes = computed(() =>
  (phrase.value?.slots ?? []).flatMap((slot, index) =>
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
const phraseCountLabel = computed(() => {
  if (!deck.value?.phrases.length) return "0 / 0";
  if (isTitleSlide.value) return "TITLE";
  return `${phraseIndex.value + 1} / ${deck.value.phrases.length}`;
});
const sourceAnchorLabel = computed(() => {
  const anchor = phrase.value?.sourceAnchor;
  if (!anchor) return "";
  return `BAR ${anchor.startMeasure}:${anchor.startNote} → ${anchor.endMeasure}:${anchor.endNote}`;
});
const currentPhraseSettings = computed(() =>
  phrase.value ? settingsForPhrase(phrase.value.id) : defaultPhraseSettings()
);
const availableSectionPresets = computed(() => [
  ...SONG_SECTION_PRESETS,
  ...customSections.value
]);
const currentSectionLabel = computed(() =>
  phrase.value?.kind === "instrumental"
    ? ""
    : sectionDisplayLabel(sectionForPhrase(phraseIndex.value))
);
const progressSections = computed(() =>
  buildSongProgressSections(
    (deck.value?.phrases ?? []).map((candidate) => candidate.id),
    sectionBreaks.value,
    sectionDisplayLabel
  )
);

async function loadScore(id: string): Promise<void> {
  stopPlayback();
  loadPhraseSettings(id);
  status.value = "Loading JPWABC";
  const fixture = findFixture(id);
  try {
    const response = await fetch(publicAssetPath(fixture.path));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const decoded = decodeJPWABCWithInfo(await response.arrayBuffer());
    const parsed = parseJPWABC(decoded.text).value;
    score.value = parsed;
    deck.value = buildLessonDeck(parsed, { id, tags: fixture.tags });
    if (Object.keys(sectionBreaks.value).length === 0) {
      sectionBreaks.value = defaultSectionBreaks(deck.value);
    }
    if (phraseIndex.value >= deck.value.phrases.length) {
      const lastIndex = deck.value.phrases.length - 1;
      void router.replace(
        lastIndex < 0
          ? { name: "score", params: { scoreId: id } }
          : { name: "phrase", params: { scoreId: id, phraseIndex: lastIndex } }
      );
    }
    resetActiveSlot();
    status.value = `${fixture.label} · ${decoded.encoding} · ${deck.value.phrases.length} phrases`;
  } catch (error) {
    score.value = null;
    deck.value = null;
    status.value = error instanceof Error ? error.message : String(error);
  }
}

function exportCurrentProject(): void {
  const currentScore = score.value;
  const currentDeck = deck.value;
  if (!currentScore || !currentDeck) return;

  const project = convertParsedScoreToTeachingProject(
    currentScore,
    scoreId.value,
    currentDeck
  ).project;
  const projectPhraseIdByFrameId = new Map<string, string>();
  project.phrases = project.phrases.map((projectPhrase, index) => {
    const frame = currentDeck.phrases[index];
    if (frame) projectPhraseIdByFrameId.set(frame.id, projectPhrase.id);
    const saved = frame ? phraseSettings.value[frame.id] : undefined;
    return saved
      ? {
          ...projectPhrase,
          annotation: saved.annotation,
          showMetronome: saved.showMetronome,
          skipDuringPlayback: saved.skipDuringPlayback
        }
      : projectPhrase;
  });

  const savedSectionBreaks = Object.entries(sectionBreaks.value).flatMap(
    ([frameId, section]) => {
      const phraseId = projectPhraseIdByFrameId.get(frameId);
      return phraseId ? [{ phraseId, section }] : [];
    }
  );
  if (savedSectionBreaks.length > 0) {
    project.sectionBreaks = savedSectionBreaks;
  }
  project.customSections = [...customSections.value];
  downloadTeachingProject(project);
}

function setPhrase(index: number): void {
  stopPlayback();
  if (!deck.value?.phrases.length) return;
  const nextIndex = Math.max(-1, Math.min(index, deck.value.phrases.length - 1));
  void router.push(
    nextIndex < 0
      ? { name: "score", params: { scoreId: scoreId.value } }
      : {
          name: "phrase",
          params: { scoreId: scoreId.value, phraseIndex: nextIndex }
        }
  );
  activeSlot.value = -1;
}

function resetActiveSlot(): void {
  activeSlot.value = firstPerformedSlotIndex(phrase.value?.slots ?? []);
}

function selectSlot(slot: PhraseSlot, index: number): void {
  if (!isPerformedSlot(slot)) return;
  activeSlot.value = index;
}

function togglePlayback(): void {
  if (isTitleSlide.value) {
    const firstIndex = nextPlayablePhraseIndex(-1);
    if (firstIndex < 0) return;
    playing.value = true;
    playbackDeadline = undefined;
    awaitingPhraseAdvance = true;
    void router.push({
      name: "phrase",
      params: { scoreId: scoreId.value, phraseIndex: firstIndex }
    });
    return;
  }
  if (playing.value) {
    stopPlayback();
    return;
  }
  if (
    phrase.value &&
    omitMarkedPhrases.value &&
    settingsForPhrase(phrase.value.id).skipDuringPlayback
  ) {
    playing.value = true;
    advancePlayback();
    return;
  }
  playing.value = true;
  playbackDeadline = undefined;
  scheduleNextSlot();
}

function scheduleNextSlot(): void {
  if (!playing.value || !phrase.value) return;
  if (
    activeSlot.value < 0 ||
    !isPerformedSlot(phrase.value.slots[activeSlot.value] ?? { context: true })
  ) {
    resetActiveSlot();
  }
  const current = phrase.value.slots[activeSlot.value];
  if (!current) {
    advancePlayback();
    return;
  }
  const bpm = Number(phrase.value.tempo || 73);
  const now = performance.now();
  playbackDeadline = nextPlaybackDeadline(
    playbackDeadline,
    now,
    slotDurationMilliseconds(current, bpm)
  );
  playTimer = window.setTimeout(() => {
    if (!phrase.value) return;
    const nextSlot = nextPerformedSlotIndex(
      phrase.value.slots,
      activeSlot.value
    );
    if (nextSlot >= 0) {
      activeSlot.value = nextSlot;
      scheduleNextSlot();
      return;
    }
    if (autoAdvance.value) {
      advancePlayback();
    } else {
      stopPlayback();
    }
  }, playbackDelayMilliseconds(playbackDeadline, now));
}

function advancePlayback(): void {
  const nextIndex = nextPlayablePhraseIndex(phraseIndex.value);
  if (nextIndex < 0) {
    stopPlayback();
    return;
  }
  awaitingPhraseAdvance = true;
  activeSlot.value = -1;
  void router.push({
    name: "phrase",
    params: { scoreId: scoreId.value, phraseIndex: nextIndex }
  });
}

function nextPlayablePhraseIndex(fromIndex: number): number {
  const phrases = deck.value?.phrases ?? [];
  return findNextPlayablePhraseIndex(
    phrases,
    fromIndex,
    omitMarkedPhrases.value,
    (candidate) => settingsForPhrase(candidate.id).skipDuringPlayback
  );
}

function stopPlayback(): void {
  playing.value = false;
  awaitingPhraseAdvance = false;
  playbackDeadline = undefined;
  if (playTimer !== undefined) window.clearTimeout(playTimer);
  playTimer = undefined;
}

function defaultPhraseSettings(): PhrasePresentationSettings {
  return {
    annotation: "",
    showMetronome: true,
    skipDuringPlayback: false
  };
}

function settingsForPhrase(phraseId: string): PhrasePresentationSettings {
  return phraseSettings.value[phraseId] ?? defaultPhraseSettings();
}

function updatePhraseSetting<K extends keyof PhrasePresentationSettings>(
  key: K,
  value: PhrasePresentationSettings[K]
): void {
  const phraseId = phrase.value?.id;
  if (!phraseId) return;
  phraseSettings.value = {
    ...phraseSettings.value,
    [phraseId]: {
      ...settingsForPhrase(phraseId),
      [key]: value
    }
  };
  savePhraseSettings();
}

function phraseSettingsStorageKey(id: string): string {
  return `jpw-teaching-phrase-settings:${id}`;
}

function sectionBreaksStorageKey(id: string): string {
  return `jpw-teaching-section-breaks:${id}`;
}

function customSectionsStorageKey(id: string): string {
  return `jpw-teaching-custom-sections:${id}`;
}

function loadPhraseSettings(id: string): void {
  try {
    const saved = window.localStorage.getItem(phraseSettingsStorageKey(id));
    const parsed = saved
      ? (JSON.parse(saved) as Record<
          string,
          PhrasePresentationSettings & { section?: string }
        >)
      : {};
    phraseSettings.value = Object.fromEntries(
      Object.entries(parsed).map(([phraseId, settings]) => {
        const { section: _legacySection, ...presentation } = settings;
        return [phraseId, presentation];
      })
    );
    const savedSectionBreaks = window.localStorage.getItem(
      sectionBreaksStorageKey(id)
    );
    sectionBreaks.value = savedSectionBreaks
      ? JSON.parse(savedSectionBreaks)
      : Object.fromEntries(
          Object.entries(parsed)
            .filter(([, settings]) => settings.section)
            .map(([phraseId, settings]) => [phraseId, settings.section])
        );
    const savedCustomSections = window.localStorage.getItem(
      customSectionsStorageKey(id)
    );
    customSections.value = savedCustomSections
      ? JSON.parse(savedCustomSections)
      : [];
  } catch {
    phraseSettings.value = {};
    sectionBreaks.value = {};
    customSections.value = [];
  }
}

function savePhraseSettings(): void {
  window.localStorage.setItem(
    phraseSettingsStorageKey(scoreId.value),
    JSON.stringify(phraseSettings.value)
  );
}

function saveSectionBreaks(): void {
  window.localStorage.setItem(
    sectionBreaksStorageKey(scoreId.value),
    JSON.stringify(sectionBreaks.value)
  );
}

function saveCustomSections(): void {
  window.localStorage.setItem(
    customSectionsStorageKey(scoreId.value),
    JSON.stringify(customSections.value)
  );
}

function sectionDisplayLabel(section: string): string {
  return availableSectionPresets.value.find((preset) => preset.id === section)?.label ?? section;
}

function defaultSectionBreaks(lessonDeck: JianpuLessonDeck): Record<string, SectionId> {
  const firstVocal = lessonDeck.phrases.find((candidate) => candidate.kind !== "instrumental");
  return firstVocal ? { [firstVocal.id]: "verse" } : {};
}

function publicAssetPath(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

function addCustomSection(): void {
  const preset = createCustomSectionPreset(
    customSectionName.value,
    customSections.value
  );
  if (!preset) return;
  customSections.value = [...customSections.value, preset];
  customSectionName.value = "";
  saveCustomSections();
}

function removeCustomSection(section: SectionId): void {
  customSections.value = customSections.value.filter(
    (preset) => preset.id !== section
  );
  sectionBreaks.value = Object.fromEntries(
    Object.entries(sectionBreaks.value).filter(([, value]) => value !== section)
  );
  saveCustomSections();
  saveSectionBreaks();
}

function sectionForPhrase(index: number): SectionId | "" {
  if (index < 0) return "";
  const phrases = deck.value?.phrases ?? [];
  let current: SectionId | "" = "";
  for (let phraseIndex = 0; phraseIndex <= index; phraseIndex += 1) {
    const phraseId = phrases[phraseIndex]?.id;
    if (phraseId && sectionBreaks.value[phraseId]) {
      current = sectionBreaks.value[phraseId]!;
    }
  }
  return current;
}

function addSectionBreak(index: number): void {
  const phraseId = deck.value?.phrases[index]?.id;
  if (!phraseId) return;
  sectionBreaks.value = {
    ...sectionBreaks.value,
    [phraseId]: sectionForPhrase(index) || (index === 0 ? "verse" : "chorus")
  };
  saveSectionBreaks();
}

function updateSectionBreak(phraseId: string, section: SectionId): void {
  sectionBreaks.value = { ...sectionBreaks.value, [phraseId]: section };
  saveSectionBreaks();
}

function removeSectionBreak(phraseId: string): void {
  const next = { ...sectionBreaks.value };
  delete next[phraseId];
  sectionBreaks.value = next;
  saveSectionBreaks();
}

watch(scoreId, (id) => void loadScore(id), { immediate: true });
watch(phrase, () => {
  resetActiveSlot();
  if (playing.value && awaitingPhraseAdvance) {
    awaitingPhraseAdvance = false;
    void nextTick().then(scheduleNextSlot);
  }
});

onBeforeUnmount(stopPlayback);
</script>

<template>
  <main class="slide-studio">
    <header class="studio-header">
      <div>
        <span class="studio-kicker">JIANPU VIDEO MODULES</span>
        <h1>乐句教学画面</h1>
        <p>{{ status }}</p>
      </div>
      <div class="studio-header-actions">
        <RouterLink
          class="legacy-link"
          :to="isSectionMap
            ? { name: 'score', params: { scoreId } }
            : { name: 'score-sections', params: { scoreId } }"
        >
          {{ isSectionMap ? "返回乐句播放器" : "段落划分" }}
        </RouterLink>
        <RouterLink class="legacy-link" :to="{ name: 'project-new' }">新建教学工程</RouterLink>
        <button
          class="legacy-link"
          type="button"
          :disabled="!deck || !score"
          @click="exportCurrentProject"
        >
          导出教学工程
        </button>
      </div>
    </header>

    <section v-if="!isSectionMap" class="studio-toolbar" aria-label="Slide controls">
      <label>
        <span>曲目</span>
        <select v-model="scoreId">
          <option v-for="fixture in demoFixtures" :key="fixture.id" :value="fixture.id">{{ fixture.label }}</option>
        </select>
      </label>
      <div class="phrase-stepper">
        <button type="button" title="上一句" aria-label="上一句" @click="setPhrase(phraseIndex - 1)">‹</button>
        <strong>{{ phraseCountLabel }}</strong>
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
      <label class="studio-toggle"><input v-model="showTranslation" type="checkbox" /> 翻译</label>
      <label class="studio-toggle"><input v-model="showRomaji" type="checkbox" /> 罗马字</label>
      <label class="studio-toggle"><input v-model="showBeatPulse" type="checkbox" /> 拍脉冲</label>
      <label class="studio-toggle"><input v-model="showKeyChanges" type="checkbox" /> 转调</label>
      <label class="studio-toggle"><input v-model="teachingGhost" type="checkbox" /> Tie ghost</label>
      <label class="studio-toggle"><input v-model="autoAdvance" type="checkbox" /> 自动翻页</label>
      <label class="studio-toggle"><input v-model="omitMarkedPhrases" type="checkbox" /> 省略已标记过门</label>
    </section>

    <div v-if="!isSectionMap" class="studio-workspace">
      <nav class="phrase-list" aria-label="乐句列表">
        <button
          v-if="deck"
          type="button"
          :class="{ 'is-selected': isTitleSlide }"
          @click="setPhrase(-1)"
        >
          <span>00</span>
          <strong>{{ deck.title }}</strong>
          <small>TITLE</small>
        </button>
        <button
          v-for="candidate in deck?.phrases"
          :key="candidate.id"
          type="button"
          :class="{
            'is-selected': candidate.index === phraseIndex,
            'is-instrumental': candidate.kind === 'instrumental'
          }"
          @click="setPhrase(candidate.index)"
        >
          <span>{{ String(candidate.index + 1).padStart(2, "0") }}</span>
          <strong>
            {{ candidate.kind === "instrumental" ? candidate.normalizedText || "过门" : candidate.teaching?.surface || candidate.normalizedText }}
          </strong>
          <small>
            <template v-if="candidate.kind === 'instrumental'">
              {{ candidate.measures.length }} 小节 ·
              {{ candidate.normalizedText === "前奏" ? "Intro" : "Interlude" }} ·
            </template>
            <template v-else-if="sectionForPhrase(candidate.index)">
              {{ sectionDisplayLabel(sectionForPhrase(candidate.index)) }} ·
            </template>
            BAR {{ candidate.sourceAnchor.startMeasure }}–{{ candidate.sourceAnchor.endMeasure }}
          </small>
        </button>
      </nav>

      <section class="stage-column">
        <div class="stage-meta">
          <span>{{ isTitleSlide ? "TITLE PAGE" : sourceAnchorLabel }}</span>
          <span>{{ phrase?.slots.length ?? 0 }} slots</span>
          <span>{{ phrase?.measures.length ?? 0 }} measures</span>
        </div>
        <div class="slide-stage">
          <JianpuTitleSlide
            v-if="isTitleSlide && titlePhrase"
            :phrase="titlePhrase"
            :subtitle="deck?.subtitle"
            :artist="deck?.artist"
            :credits="deck?.credits"
            :tags="deck?.tags"
          />
          <JianpuLessonSlide
            v-else-if="phrase"
            :phrase="phrase"
            :active-slot="activeSlot"
            :teaching-ghost="teachingGhost"
            :show-romaji="showRomaji"
            :show-translation="showTranslation"
            :show-key-changes="showKeyChanges"
            :show-beat-pulse="showBeatPulse && currentPhraseSettings.showMetronome"
            :section-label="currentSectionLabel"
            :annotation="currentPhraseSettings.annotation"
            :artist="deck?.artist"
            :credits="deck?.credits"
            :tags="deck?.tags"
            :phrase-count="deck?.phrases.length ?? 1"
            :progress-sections="progressSections"
            @select-slot="selectSlot"
          />
          <div v-else class="stage-empty">{{ status }}</div>
        </div>
        <p class="stage-caption">
          16:9 · 纯 SVG 谱面 · 乐句与小节边界独立 · 可由 activeSlot 驱动逐音高亮
        </p>

        <section v-if="phrase" class="phrase-presentation-settings">
          <label class="studio-toggle">
            <input
              type="checkbox"
              :checked="currentPhraseSettings.showMetronome"
              @change="updatePhraseSetting('showMetronome', ($event.target as HTMLInputElement).checked)"
            />
            显示节拍器
          </label>
          <label class="studio-toggle">
            <input
              type="checkbox"
              :checked="currentPhraseSettings.skipDuringPlayback"
              @change="updatePhraseSetting('skipDuringPlayback', ($event.target as HTMLInputElement).checked)"
            />
            {{ phrase.kind === "instrumental"
              ? `连续播放时省略此${phrase.normalizedText || "过门"}`
              : "连续播放时跳过" }}
          </label>
          <label class="phrase-annotation-field">
            <span>自由注释</span>
            <textarea
              :value="currentPhraseSettings.annotation"
              placeholder="动机节奏型四遍后进入；大提琴与打击乐加入……"
              @input="updatePhraseSetting('annotation', ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
          </label>
        </section>
      </section>
    </div>

    <section v-else class="score-section-map">
      <header class="score-section-heading">
        <div>
          <span>SECTION MAP</span>
          <h2>{{ deck?.title || "段落划分" }}</h2>
        </div>
        <label>
          <span>曲目</span>
          <select v-model="scoreId">
            <option
              v-for="fixture in demoFixtures"
              :key="fixture.id"
              :value="fixture.id"
            >
              {{ fixture.label }}
            </option>
          </select>
        </label>
      </header>

      <div class="score-custom-section-editor">
        <label>
          <span>自定义段落名称</span>
          <input
            v-model="customSectionName"
            placeholder="例如 Instrumental Break"
            @keyup.enter="addCustomSection"
          />
        </label>
        <button type="button" @click="addCustomSection">添加</button>
        <div v-if="customSections.length" class="score-custom-section-list">
          <span v-for="preset in customSections" :key="preset.id">
            <strong>{{ preset.label }}</strong>
            <button
              type="button"
              :aria-label="`删除自定义段落 ${preset.label}`"
              title="删除自定义段落"
              @click="removeCustomSection(preset.id)"
            >
              ×
            </button>
          </span>
        </div>
      </div>

      <div class="score-section-timeline">
        <div
          v-for="candidate in deck?.phrases"
          :key="candidate.id"
          class="score-section-entry"
        >
          <div class="score-section-break">
            <template v-if="sectionBreaks[candidate.id]">
              <span class="score-section-marker" aria-hidden="true"></span>
              <select
                :value="sectionBreaks[candidate.id]"
                :aria-label="`第 ${candidate.index + 1} 句起始段落`"
                @change="updateSectionBreak(
                  candidate.id,
                  ($event.target as HTMLSelectElement).value as SectionId
                )"
              >
                <option
                  v-for="preset in availableSectionPresets"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.label }}
                </option>
              </select>
              <button
                type="button"
                class="score-remove-break"
                :aria-label="`删除第 ${candidate.index + 1} 句前的段落分割点`"
                title="删除段落分割点"
                @click="removeSectionBreak(candidate.id)"
              >
                ×
              </button>
            </template>
            <button
              v-else
              type="button"
              class="score-add-break"
              @click="addSectionBreak(candidate.index)"
            >
              ＋ 段落分割点
            </button>
          </div>

          <button
            type="button"
            class="score-section-phrase"
            @click="setPhrase(candidate.index)"
          >
            <span>{{ String(candidate.index + 1).padStart(2, "0") }}</span>
            <strong>{{ candidate.teaching?.surface || candidate.normalizedText }}</strong>
            <small>{{ sectionDisplayLabel(sectionForPhrase(candidate.index)) || "未分段" }}</small>
            <em>
              BAR {{ candidate.sourceAnchor.startMeasure }}–{{ candidate.sourceAnchor.endMeasure }}
            </em>
          </button>
        </div>
      </div>
    </section>

    <details v-if="deck?.diagnostics.length" class="studio-diagnostics">
      <summary>源文件诊断 {{ deck.diagnostics.length }}</summary>
      <p v-for="(diagnostic, index) in deck.diagnostics.slice(0, 20)" :key="`${diagnostic.code}-${index}`">
        <strong>{{ diagnostic.code }}</strong>
        {{ diagnostic.raw || diagnostic.message }}
      </p>
    </details>
  </main>
</template>
