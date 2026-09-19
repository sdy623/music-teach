<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  LETTER_SECTION_PRESETS,
  POP_SECTION_PRESETS,
  analyzeJapaneseReference,
  createCustomSectionPreset,
  createProjectPhrase,
  createTeachingProject,
  formatProjectCredits,
  removeSectionBreak,
  resolvePhraseSection,
  setSectionBreak,
  splitProjectPhrase
} from "./projectBuilder";
import { convertJPWABCToTeachingProject } from "./jpwabcProject";
import {
  deserializeTeachingProject,
  downloadTeachingProject
} from "./projectExport";
import {
  createLocalProjectId,
  loadCurrentTeachingProject,
  loadTeachingProjectLocally,
  saveTeachingProjectLocally
} from "./projectStore";
import { projectInstrumentalRunCaption } from "./projectPhraseSemantics";
import SlidevJianpuPhrase from "./SlidevJianpuPhrase.vue";
import { buildSongProgressSections } from "../slide/teachingPresentation";
import type {
  SectionId,
  TeachingPhraseKind,
  TeachingProject,
  TeachingProjectPhrase,
  TeachingSectionBreak
} from "./types";
import "./projectStudio.css";
import AppHeader from "../ui/AppHeader.vue";

type EditorMode = "phrases" | "sections";
const route = useRoute();
const router = useRouter();
const projectTitle = ref("新建教学工程");
const sourceLyrics = ref("");
const project = ref<TeachingProject>(createBlankProject());
const selectedIndex = ref(0);
const splitOffsets = ref<Record<string, number>>({});
const editorMode = ref<EditorMode>("phrases");
const importInput = ref<HTMLInputElement>();
const importError = ref("");
const importStatus = ref("");
const saveStatus = ref("已在本机自动保存");
const customSectionName = ref("");

const selectedPhrase = computed(
  () => project.value.phrases[selectedIndex.value]
);
const instrumentalRunCaption = computed(() => projectInstrumentalRunCaption(project.value, selectedIndex.value));
const selectedSectionLabel = computed(() => {
  if (selectedPhrase.value?.kind === "instrumental") return "";
  return sectionLabel(resolvePhraseSection(project.value, selectedIndex.value));
});
const projectCredits = computed(() => formatProjectCredits(project.value));
const sectionBreaksByPhrase = computed(
  () =>
    new Map(
      project.value.sectionBreaks.map((sectionBreak) => [
        sectionBreak.phraseId,
        sectionBreak
      ])
    )
);
const selectedCharacterCount = computed(
  () => Array.from(selectedPhrase.value?.lyricText ?? "").length
);
const sectionPresets = computed(() => [
  ...LETTER_SECTION_PRESETS,
  ...POP_SECTION_PRESETS,
  ...project.value.customSections
]);
const projectProgressSections = computed(() =>
  buildSongProgressSections(
    project.value.phrases.map((phrase) => phrase.id),
    Object.fromEntries(
      project.value.sectionBreaks.map((entry) => [entry.phraseId, entry.section])
    ),
    sectionLabel
  )
);

function createBlankProject(): TeachingProject {
  const blank = createTeachingProject(projectTitle.value, sourceLyrics.value);
  return { ...blank, id: createLocalProjectId(blank.title) };
}

function routeParamText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function sectionLabel(section: string | undefined): string {
  return sectionPresets.value.find(
    (preset) => preset.id === section
  )?.label ?? section ?? "未分段";
}

function sectionBreakFor(phraseId: string): TeachingSectionBreak | undefined {
  return sectionBreaksByPhrase.value.get(phraseId);
}

function resolvedSectionAt(index: number): string {
  return sectionLabel(resolvePhraseSection(project.value, index));
}

function addSectionBreakAt(index: number): void {
  const phrase = project.value.phrases[index];
  if (!phrase) return;
  const inherited = resolvePhraseSection(project.value, index);
  project.value = setSectionBreak(
    project.value,
    phrase.id,
    inherited ?? (index === 0 ? "verse" : "chorus")
  );
}

function updateSectionBreak(phraseId: string, section: SectionId): void {
  project.value = setSectionBreak(project.value, phraseId, section);
}

function addCustomSection(): void {
  const preset = createCustomSectionPreset(
    customSectionName.value,
    project.value.customSections
  );
  if (!preset) return;
  project.value = {
    ...project.value,
    customSections: [...project.value.customSections, preset]
  };
  customSectionName.value = "";
}

function removeCustomSection(section: SectionId): void {
  project.value = {
    ...project.value,
    customSections: project.value.customSections.filter(
      (preset) => preset.id !== section
    ),
    sectionBreaks: project.value.sectionBreaks.filter(
      (sectionBreak) => sectionBreak.section !== section
    )
  };
}

function deleteSectionBreak(phraseId: string): void {
  project.value = removeSectionBreak(project.value, phraseId);
}

function rebuildFromLyrics(): void {
  const rebuilt = createTeachingProject(project.value.title, sourceLyrics.value);
  project.value = {
    ...rebuilt,
    id: project.value.id,
    tags: [...project.value.tags],
    artist: project.value.artist,
    lyricist: project.value.lyricist,
    composer: project.value.composer,
    arranger: project.value.arranger,
    otherCredits: project.value.otherCredits,
    keyAndMeters: project.value.keyAndMeters,
    expression: project.value.expression,
    customSections: [...project.value.customSections]
  };
  selectedIndex.value = 0;
}

function updateProjectField(
  key:
    | "title"
    | "artist"
    | "lyricist"
    | "composer"
    | "arranger"
    | "otherCredits"
    | "keyAndMeters"
    | "expression",
  value: string
): void {
  project.value = { ...project.value, [key]: value };
  if (key === "title") projectTitle.value = value;
}

function updateProjectTags(value: string): void {
  project.value = {
    ...project.value,
    tags: [...new Set(value.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean))]
  };
}

function updatePhrase<K extends keyof TeachingProjectPhrase>(
  key: K,
  value: TeachingProjectPhrase[K]
): void {
  patchSelectedPhrase({ [key]: value } as Pick<TeachingProjectPhrase, K>);
}

function patchSelectedPhrase(
  patch: Partial<TeachingProjectPhrase>
): void {
  const phrase = selectedPhrase.value;
  if (!phrase) return;
  const phrases = [...project.value.phrases];
  phrases[selectedIndex.value] = { ...phrase, ...patch };
  project.value = { ...project.value, phrases };
}

function updateLyricText(value: string): void {
  const phrase = selectedPhrase.value;
  if (!phrase) return;
  const morphology = analyzeJapaneseReference(value);
  const followsAutomaticReading =
    phrase.lyricCells.length === 0 &&
    (!phrase.lyricJpwabc ||
      phrase.lyricJpwabc === phrase.referenceReading ||
      phrase.lyricJpwabc === phrase.lyricText);
  updatePhrase("lyricText", value);
  updatePhrase("referenceReading", morphology.referenceReading);
  updatePhrase("morphology", morphology.tokens);
  if (followsAutomaticReading) {
    updatePhrase("lyricJpwabc", morphology.referenceReading);
  }
}

function reanalyzeReading(): void {
  const phrase = selectedPhrase.value;
  if (!phrase) return;
  const morphology = analyzeJapaneseReference(phrase.lyricText);
  const followsAutomaticReading =
    phrase.lyricCells.length === 0 &&
    (!phrase.lyricJpwabc || phrase.lyricJpwabc === phrase.referenceReading);
  updatePhrase("referenceReading", morphology.referenceReading);
  updatePhrase("morphology", morphology.tokens);
  if (followsAutomaticReading) {
    updatePhrase("lyricJpwabc", morphology.referenceReading);
  }
}

function updateLyricJpwabc(value: string): void {
  patchSelectedPhrase({
    lyricJpwabc: value,
    lyricCells: [],
    frame: undefined
  });
}

function updateVoiceLine(value: string): void {
  patchSelectedPhrase({ voiceLine: value, frame: undefined });
}

function updatePhraseKind(kind: TeachingPhraseKind): void {
  patchSelectedPhrase({
    kind,
    frame: undefined,
    skipDuringPlayback:
      kind === "instrumental"
        ? true
        : selectedPhrase.value?.skipDuringPlayback ?? false
  });
}

function addPhrase(kind: TeachingPhraseKind): void {
  const wasEmpty = project.value.phrases.length === 0;
  const next = createProjectPhrase("", project.value.phrases.length);
  next.kind = kind;
  if (kind === "instrumental") {
    next.skipDuringPlayback = true;
  } else if (kind === "blank") {
    next.showMetronome = false;
  }
  let nextProject: TeachingProject = {
    ...project.value,
    phrases: [...project.value.phrases, next]
  };
  if (wasEmpty) {
    nextProject = setSectionBreak(
      nextProject,
      next.id,
      kind === "instrumental" ? "interlude" : "verse"
    );
  }
  project.value = nextProject;
  selectedIndex.value = project.value.phrases.length - 1;
}

function removeSelectedPhrase(): void {
  const removedPhrase = selectedPhrase.value;
  if (!removedPhrase) return;
  const removedBreak = sectionBreakFor(removedPhrase.id);
  const phrases = project.value.phrases.filter(
    (_, index) => index !== selectedIndex.value
  );
  const sectionBreaks = project.value.sectionBreaks.filter(
    (sectionBreak) => sectionBreak.phraseId !== removedPhrase.id
  );
  const replacement = phrases[Math.min(selectedIndex.value, phrases.length - 1)];
  if (
    removedBreak &&
    replacement &&
    !sectionBreaks.some(
      (sectionBreak) => sectionBreak.phraseId === replacement.id
    )
  ) {
    sectionBreaks.push({
      phraseId: replacement.id,
      section: removedBreak.section
    });
  }
  project.value = { ...project.value, phrases, sectionBreaks };
  selectedIndex.value = Math.max(
    0,
    Math.min(selectedIndex.value, phrases.length - 1)
  );
}

function moveSelectedPhrase(direction: -1 | 1): void {
  const targetIndex = selectedIndex.value + direction;
  if (
    !selectedPhrase.value ||
    targetIndex < 0 ||
    targetIndex >= project.value.phrases.length
  ) {
    return;
  }
  const phrases = [...project.value.phrases];
  const current = phrases[selectedIndex.value]!;
  phrases[selectedIndex.value] = phrases[targetIndex]!;
  phrases[targetIndex] = current;
  project.value = { ...project.value, phrases };
  selectedIndex.value = targetIndex;
}

function splitSelectedPhrase(): void {
  const phrase = selectedPhrase.value;
  if (!phrase) return;
  const offset =
    splitOffsets.value[phrase.id] ??
    Math.max(1, Math.floor(selectedCharacterCount.value / 2));
  const result = splitProjectPhrase(phrase, offset, selectedIndex.value);
  if (!result) return;

  const phrases = [...project.value.phrases];
  phrases.splice(selectedIndex.value, 1, ...result);
  project.value = { ...project.value, phrases };
}

function exportProject(): void {
  persistCurrentProject();
  downloadTeachingProject(project.value);
}

function openProjectPlayer(): void {
  persistCurrentProject();
  void router.push({
    name: "project-phrase",
    params: { projectId: project.value.id, phraseIndex: 0 }
  });
}

function openProjectImport(): void {
  importError.value = "";
  importStatus.value = "";
  importInput.value?.click();
}

async function importProject(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const isJSON = file.name.toLocaleLowerCase().endsWith(".json");
    let imported: TeachingProject;
    if (isJSON) {
      imported = deserializeTeachingProject(await file.text());
      importStatus.value = `已导入 JSON 工程：${imported.phrases.length} 个乐句`;
    } else {
      const converted = convertJPWABCToTeachingProject(
        await file.arrayBuffer(),
        file.name.replace(/\.(?:jpwabc|abc)$/i, "")
      );
      imported = converted.project;
      importStatus.value = `JPWABC 已转换：${imported.phrases.length} 个乐句 · ${converted.encoding} · ${converted.diagnostics.length} 条诊断`;
    }
    project.value = imported;
    projectTitle.value = imported.title;
    sourceLyrics.value =
      imported.sourceLyrics ||
      imported.phrases.map((phrase) => phrase.lyricText).join("\n\n");
    selectedIndex.value = 0;
    splitOffsets.value = {};
    editorMode.value = "phrases";
  } catch (error) {
    importStatus.value = "";
    importError.value = `导入失败：${error instanceof Error ? error.message : "无法读取文件"}`;
  } finally {
    input.value = "";
  }
}

function persistCurrentProject(): void {
  const result = saveTeachingProjectLocally(project.value);
  saveStatus.value = result.ok
    ? "已在本机自动保存"
    : `自动保存失败：${result.error ?? "浏览器拒绝写入"}`;
}

onMounted(() => {
  const routeProjectId = routeParamText(route.params.projectId);
  const saved = routeProjectId
    ? loadTeachingProjectLocally(routeProjectId)
    : loadCurrentTeachingProject();
  if (saved) {
    project.value = saved;
    projectTitle.value = project.value.title;
    sourceLyrics.value = project.value.sourceLyrics;
  } else if (routeProjectId) {
    importError.value = "未找到这个本机工程，已建立一个新的可恢复工程。";
  }
  persistCurrentProject();
  window.addEventListener("pagehide", persistCurrentProject);
});

watch(
  sourceLyrics,
  (value) => {
    if (project.value.sourceLyrics === value) return;
    project.value = { ...project.value, sourceLyrics: value };
  },
  { flush: "sync" }
);
watch(project, persistCurrentProject, { deep: true, flush: "sync" });
onBeforeUnmount(() => {
  window.removeEventListener("pagehide", persistCurrentProject);
  persistCurrentProject();
});
</script>

<template>
  <AppHeader section="legacy" />
  <main class="project-studio">
    <header class="project-header">
      <div>
        <span>TEACHING PROJECT</span>
        <h1>教学工程编辑器</h1>
      </div>
      <div class="project-header-actions">
        <span class="project-save-status" role="status">{{ saveStatus }}</span>
        <button class="project-header-button" type="button" @click="openProjectPlayer">
          播放当前工程
        </button>
        <input
          ref="importInput"
          class="project-file-input"
          type="file"
          accept=".json,.jpwabc,.abc,application/json,text/plain"
          @change="importProject"
        />
        <button type="button" @click="openProjectImport">导入工程</button>
        <button type="button" @click="exportProject">导出工程</button>
      </div>
    </header>
    <p v-if="importError" class="project-import-error" role="alert">
      {{ importError }}
    </p>
    <p v-else-if="importStatus" class="project-import-status" role="status">
      {{ importStatus }}
    </p>

    <section class="project-toolbar">
      <label class="project-title-field">
        <span>工程名</span>
        <input
          :value="project.title"
          @input="updateProjectField('title', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>歌手 / Artist</span>
        <input
          :value="project.artist"
          @input="updateProjectField('artist', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>作词</span>
        <input
          :value="project.lyricist"
          @input="updateProjectField('lyricist', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>作曲</span>
        <input
          :value="project.composer"
          @input="updateProjectField('composer', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>编曲</span>
        <input
          :value="project.arranger"
          @input="updateProjectField('arranger', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>其他信息</span>
        <input
          :value="project.otherCredits"
          @input="updateProjectField('otherCredits', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>流派标签</span>
        <input
          :value="project.tags.join(', ')"
          placeholder="VOCALOID, J-POP"
          @input="updateProjectTags(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>调号与拍号</span>
        <input
          :value="project.keyAndMeters"
          @input="updateProjectField('keyAndMeters', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span>速度与表情</span>
        <input
          :value="project.expression"
          @input="updateProjectField('expression', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <button type="button" @click="addPhrase('vocal')">新增演唱句</button>
      <button type="button" @click="addPhrase('instrumental')">新增过门</button>
      <button type="button" @click="addPhrase('blank')">新增空白页</button>
    </section>

    <nav class="project-view-tabs" aria-label="工程编辑视图">
      <button
        type="button"
        :class="{ 'is-active': editorMode === 'phrases' }"
        :aria-pressed="editorMode === 'phrases'"
        @click="editorMode = 'phrases'"
      >
        乐句编辑
      </button>
      <button
        type="button"
        :class="{ 'is-active': editorMode === 'sections' }"
        :aria-pressed="editorMode === 'sections'"
        @click="editorMode = 'sections'"
      >
        段落划分
      </button>
    </nav>

    <div v-if="editorMode === 'phrases'" class="project-workspace">
      <aside class="project-source-pane">
        <label class="project-source-field">
          <span>歌词原文</span>
          <textarea v-model="sourceLyrics"></textarea>
        </label>
        <button class="project-primary-button" type="button" @click="rebuildFromLyrics">
          按空行生成乐句
        </button>

        <nav class="project-phrase-list" aria-label="教学乐句">
          <button
            v-for="(phrase, index) in project.phrases"
            :key="phrase.id"
            type="button"
            :class="{ 'is-selected': index === selectedIndex }"
            @click="selectedIndex = index"
          >
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <strong>
              {{ phrase.lyricText || phrase.annotation || (phrase.kind === "instrumental" ? "过门" : phrase.kind) }}
            </strong>
            <small>
              {{ phrase.kind === "instrumental" ? "Interlude" : resolvedSectionAt(index) }} · {{ phrase.kind }}
            </small>
          </button>
        </nav>
      </aside>

      <section class="project-editor-pane">
        <div class="project-preview">
          <SlidevJianpuPhrase
            :instrumental-run-caption="instrumentalRunCaption"
            v-if="selectedPhrase"
            :phrase="selectedPhrase.frame"
            :kind="selectedPhrase.kind"
            :voice-line="selectedPhrase.kind === 'blank' ? '' : selectedPhrase.voiceLine"
            :lyric-text="selectedPhrase.lyricText"
            :lyric-jpwabc="selectedPhrase.lyricJpwabc"
            :lyric-cells="selectedPhrase.lyricCells"
            :reference-reading="selectedPhrase.referenceReading"
            :morphology="selectedPhrase.morphology"
            :key-of-one="selectedPhrase.keyOfOne"
            :key-changes="selectedPhrase.keyChanges"
            :title="project.title"
            :artist="project.artist"
            :credits="projectCredits"
            :tags="project.tags"
            :key-and-meters="project.keyAndMeters"
            :expression="project.expression"
            :section="selectedSectionLabel"
            :annotation="selectedPhrase.annotation"
            :show-metronome="selectedPhrase.showMetronome"
            :phrase-index="selectedIndex"
            :phrase-count="project.phrases.length"
            :progress-sections="projectProgressSections"
          />
          <div v-else class="project-preview-empty">空白工程</div>
        </div>

        <div v-if="selectedPhrase" class="project-phrase-editor">
          <div class="project-editor-actions">
            <strong>乐句 {{ selectedIndex + 1 }}</strong>
            <button type="button" :disabled="selectedIndex === 0" @click="moveSelectedPhrase(-1)">
              上移
            </button>
            <button
              type="button"
              :disabled="selectedIndex >= project.phrases.length - 1"
              @click="moveSelectedPhrase(1)"
            >
              下移
            </button>
            <button type="button" @click="removeSelectedPhrase">删除</button>
          </div>

          <div class="project-form-grid">
            <label class="project-wide-field">
              <span>歌词</span>
              <textarea
                :value="selectedPhrase.lyricText"
                @input="updateLyricText(($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </label>
            <label class="project-wide-field">
              <span>参考假名</span>
              <textarea
                :value="selectedPhrase.referenceReading"
                @input="updatePhrase('referenceReading', ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
              <button type="button" @click="reanalyzeReading">重新分析</button>
            </label>
            <label class="project-wide-field">
              <span>JPWABC 音位歌词</span>
              <textarea
                :value="selectedPhrase.lyricJpwabc"
                @input="updateLyricJpwabc(($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </label>

            <label>
              <span>页面类型</span>
              <select
                :value="selectedPhrase.kind"
                @change="updatePhraseKind(($event.target as HTMLSelectElement).value as TeachingPhraseKind)"
              >
                <option value="vocal">演唱</option>
                <option value="instrumental">伴奏 / 前奏 / 过门</option>
                <option value="blank">空白教学页</option>
              </select>
            </label>
            <label class="project-check-field">
              <input
                type="checkbox"
                :checked="selectedPhrase.showMetronome"
                @change="updatePhrase('showMetronome', ($event.target as HTMLInputElement).checked)"
              />
              <span>显示节拍器</span>
            </label>
            <label class="project-check-field">
              <input
                type="checkbox"
                :checked="selectedPhrase.skipDuringPlayback"
                @change="updatePhrase('skipDuringPlayback', ($event.target as HTMLInputElement).checked)"
              />
              <span>连续播放时省略</span>
            </label>

            <label class="project-wide-field">
              <span>单行 JPWABC Voice</span>
              <textarea
                :value="selectedPhrase.voiceLine"
                placeholder="| 1_ 2_ 3 5 | 5-- 0_ 5_ |"
                @input="updateVoiceLine(($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </label>
            <label class="project-wide-field">
              <span>自由注释</span>
              <textarea
                :value="selectedPhrase.annotation"
                placeholder="动机旋律节奏型四遍后走；大提琴、打击乐进入……"
                @input="updatePhrase('annotation', ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </label>

            <div class="project-morphology project-wide-field">
              <span>形态素参考</span>
              <div>
                <span
                  v-for="token in selectedPhrase.morphology"
                  :key="token.id"
                  :class="{ 'needs-review': token.needsReview }"
                >
                  <b>{{ token.surface }}</b>
                  <small>{{ token.reading || "校对" }}</small>
                </span>
              </div>
            </div>

            <div class="project-split-control project-wide-field">
              <label>
                <span>字符位置</span>
                <input
                  v-model.number="splitOffsets[selectedPhrase.id]"
                  type="number"
                  min="1"
                  :max="Math.max(1, selectedCharacterCount - 1)"
                />
              </label>
              <button type="button" @click="splitSelectedPhrase">在此拆分乐句</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section v-else class="project-section-screen">
      <header class="project-section-heading">
        <div>
          <span>SECTION MAP</span>
          <h2>段落划分</h2>
        </div>
        <strong>{{ project.phrases.length }} 乐句</strong>
      </header>

      <div class="project-custom-section-editor">
        <label>
          <span>自定义段落名称</span>
          <input
            v-model="customSectionName"
            placeholder="例如 Instrumental Break"
            @keyup.enter="addCustomSection"
          />
        </label>
        <button type="button" @click="addCustomSection">添加</button>
        <div v-if="project.customSections.length" class="project-custom-section-list">
          <span v-for="preset in project.customSections" :key="preset.id">
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

      <div class="project-section-timeline">
        <div
          v-for="(phrase, index) in project.phrases"
          :key="phrase.id"
          class="project-section-entry"
        >
          <div class="project-section-break">
            <template v-if="sectionBreakFor(phrase.id)">
              <span class="project-section-marker" aria-hidden="true"></span>
              <select
                :value="sectionBreakFor(phrase.id)?.section"
                :aria-label="`第 ${index + 1} 句起始段落`"
                @change="updateSectionBreak(
                  phrase.id,
                  ($event.target as HTMLSelectElement).value as SectionId
                )"
              >
                <optgroup label="字母段落">
                  <option
                    v-for="preset in LETTER_SECTION_PRESETS"
                    :key="preset.id"
                    :value="preset.id"
                  >
                    {{ preset.label }}
                  </option>
                </optgroup>
                <optgroup label="流行乐结构">
                  <option
                    v-for="preset in POP_SECTION_PRESETS"
                    :key="preset.id"
                    :value="preset.id"
                  >
                    {{ preset.label }}
                  </option>
                </optgroup>
                <optgroup v-if="project.customSections.length" label="自定义">
                  <option
                    v-for="preset in project.customSections"
                    :key="preset.id"
                    :value="preset.id"
                  >
                    {{ preset.label }}
                  </option>
                </optgroup>
              </select>
              <button
                type="button"
                class="project-remove-break"
                :aria-label="`删除第 ${index + 1} 句前的段落分割点`"
                title="删除段落分割点"
                @click="deleteSectionBreak(phrase.id)"
              >
                ×
              </button>
            </template>
            <button
              v-else
              type="button"
              class="project-add-break"
              @click="addSectionBreakAt(index)"
            >
              ＋ 段落分割点
            </button>
          </div>

          <button
            type="button"
            class="project-section-phrase"
            @click="selectedIndex = index; editorMode = 'phrases'"
          >
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <strong>{{ phrase.lyricText || phrase.annotation || phrase.kind }}</strong>
            <small>{{ phrase.kind === "instrumental" ? "Interlude" : resolvedSectionAt(index) }}</small>
            <em>{{ phrase.kind }}</em>
          </button>
        </div>
      </div>
    </section>
  </main>
</template>
