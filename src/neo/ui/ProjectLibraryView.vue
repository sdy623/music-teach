<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { libraryClient } from "../library/LibraryClient";
import type { ProjectLifecycle, ProjectSummary } from "../library/types";
import NeoFrame from "./NeoFrame.vue";
import ScoreThumbnail from "./ScoreThumbnail.vue";
import ImportDialog from "./ImportDialog.vue";
const projects = ref<ProjectSummary[]>([]);
const search = ref("");
const tag = ref("");
const notation = ref("");
const sort = ref("updated");
const section = ref("current");
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const selected = ref<string[]>([]);
const importing = ref<{ fixture?: string; legacyKey?: string } | null>(null);
const legacy = ref<{ key: string; title: string }[]>([]);
const tags = computed(() => [...new Set(projects.value.flatMap(project => project.tags))].sort());
const counts = computed(() => ({ current: projects.value.filter(p => p.lifecycle === 'active' || p.lifecycle === 'draft').length, archived: projects.value.filter(p => p.lifecycle === 'archived').length, trashed: projects.value.filter(p => p.lifecycle === 'trashed').length }));
const visible = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return projects.value.filter(project => (section.value === "current" ? ["draft", "active"].includes(project.lifecycle) : project.lifecycle === section.value)
    && (!query || `${project.title} ${project.artist} ${project.tags.join(" ")}`.toLocaleLowerCase().includes(query))
    && (!tag.value || project.tags.includes(tag.value)) && (!notation.value || project.notation === notation.value))
    .sort((a, b) => sort.value === "title" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt));
});
async function refresh() {
  loading.value = true; error.value = "";
  try { projects.value = await libraryClient.request<ProjectSummary[]>({ method: "list" }); selected.value = []; }
  catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); }
  finally { loading.value = false; }
}
async function action(project: ProjectSummary, operation: ProjectLifecycle | "restore" | "duplicate") {
  busy.value = true; error.value = "";
  try {
    await libraryClient.request(operation === "duplicate" ? { method: "duplicate", id: project.id, revision: project.revision } : { method: "lifecycle", id: project.id, revision: project.revision, lifecycle: operation });
    notice.value = operation === "duplicate" ? `已复制「${project.title}」。` : `已更新「${project.title}」的状态。`;
    await refresh();
  } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); }
  finally { busy.value = false; }
}
async function bulkTrash() {
  busy.value = true; error.value = "";
  let completed = 0;
  try {
    for (const id of [...selected.value]) {
      const project = projects.value.find(p => p.id === id)!;
      await libraryClient.request({ method: "lifecycle", id, revision: project.revision, lifecycle: "trashed" }); completed++;
    }
    await refresh(); notice.value = `已将 ${completed} 个工程移入垃圾箱，可随时恢复。`;
  } catch (failure) { error.value = `已完成 ${completed} 个，其余未更改。${failure instanceof Error ? failure.message : String(failure)}`; }
  finally { busy.value = false; }
}
function scanLegacy() {
  const entries: typeof legacy.value = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key || !(key === "jpw-teaching-project:draft" || key.startsWith("music-teach:project:v1:") || key.startsWith("music-teach:neo:project:v1:"))) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? "null");
        entries.push({ key, title: String(value?.project?.metadata?.title ?? value?.title ?? "未命名旧工程") });
      } catch { entries.push({ key, title: "无法读取的旧工程（可检查原文）" }); }
    }
    legacy.value = entries;
  } catch { /* Main library remains available without localStorage. */ }
}
const labels: Record<ProjectLifecycle, string> = { draft: "草稿", active: "进行中", archived: "已归档", trashed: "垃圾箱" };
onMounted(() => { void refresh(); scanLegacy(); });
</script>
<template>
  <NeoFrame>
    <section class="neo-page-heading"><div><span class="neo-eyebrow">你的音乐与课堂</span><h1>工程库</h1><p>从一张谱开始，让每一次备课都有迹可循。</p></div><div class="neo-actions"><button :disabled="busy" @click="importing = {}">导入工程</button><RouterLink class="neo-primary" to="/projects/new">＋ 新建工程</RouterLink></div></section>
    <div class="neo-library-layout">
      <aside class="neo-sidebar"><nav aria-label="工程状态"><button v-for="item in [{id:'current',label:'全部工程'},{id:'archived',label:'已归档'},{id:'trashed',label:'垃圾箱'}]" :key="item.id" :class="{selected: section === item.id}" @click="section = item.id; selected = []">{{ item.label }}<span>{{ counts[item.id as keyof typeof counts] }}</span></button></nav><div class="neo-side-note"><strong>从示例开始</strong><p>预检后，保存为自己的工程。</p><button @click="importing = {fixture:'sakura'}">さくら →</button></div><details v-if="legacy.length" class="neo-side-note"><summary>迁入旧工程（{{ legacy.length }}）</summary><button v-for="item in legacy" :key="item.key" @click="importing = {legacyKey:item.key}">{{ item.title }}</button><p>旧数据继续保留。</p></details></aside>
      <section class="neo-library-content" aria-label="工程列表">
        <div class="neo-toolbar"><label class="neo-search"><span class="sr-only">搜索工程</span><input v-model="search" type="search" placeholder="搜索标题、作者或标签"></label><label><span class="sr-only">标签筛选</span><select v-model="tag"><option value="">所有标签</option><option v-for="item in tags" :key="item">{{ item }}</option></select></label><label><span class="sr-only">谱型筛选</span><select v-model="notation"><option value="">全部谱型</option><option value="jianpu">简谱</option><option disabled>五线谱（尚未支持）</option><option disabled>TAB（尚未支持）</option></select></label><label><span class="sr-only">排序</span><select v-model="sort"><option value="updated">最近更新</option><option value="title">标题顺序</option></select></label><button aria-label="刷新工程库" :disabled="busy || loading" @click="refresh">刷新</button></div>
        <p v-if="error" class="neo-error" role="alert">{{ error }}</p><p v-if="notice" class="neo-notice" role="status">{{ notice }}</p>
        <div v-if="selected.length && section !== 'trashed'" class="neo-selection"><span>已选 {{ selected.length }} 个工程</span><button :disabled="busy" @click="bulkTrash">移入垃圾箱</button><button @click="selected = []">取消选择</button></div>
        <p v-if="loading" role="status" class="neo-empty">正在打开工程库…</p>
        <div v-else-if="!visible.length" class="neo-empty"><span class="neo-empty-note" aria-hidden="true">♩</span><h2>{{ projects.length ? '这里还没有匹配的工程' : '第一份教学工程，从这里开始' }}</h2><p>{{ projects.length ? '试试其他标签、关键词或工程状态。' : '新建一张空白简谱，或导入已有谱面。你的工程会保存在本机。' }}</p><div v-if="!projects.length" class="neo-actions"><RouterLink class="neo-primary" to="/projects/new">新建空白简谱</RouterLink><button @click="importing = {}">导入谱面</button></div></div>
        <div v-else class="neo-card-grid"><article v-for="project in visible" :key="project.id" class="neo-card"><RouterLink :to="{name:'project-edit',params:{projectId:project.id}}" :aria-label="`打开 ${project.title}`"><ScoreThumbnail :frame="project.thumbnail" /></RouterLink><div class="neo-card-body"><div class="neo-card-top"><span class="neo-badge">{{ labels[project.lifecycle] }}</span><label v-if="section !== 'trashed'"><input v-model="selected" type="checkbox" :value="project.id" :aria-label="`选择 ${project.title}`"></label></div><h2><RouterLink :to="{name:'project-edit',params:{projectId:project.id}}">{{ project.title }}</RouterLink></h2><p>{{ project.artist || '尚未填写作者' }}</p><div class="neo-tags"><span v-for="item in project.tags.slice(0,4)" :key="item">{{ item }}</span></div><footer><span>{{ project.measures }} 小节 · {{ project.phrases }} 乐句<br><small>{{ new Date(project.updatedAt).toLocaleString() }}</small></span><details class="neo-card-menu"><summary :aria-label="`${project.title} 的操作`">•••</summary><div><button :disabled="busy" @click="action(project, 'duplicate')">复制工程</button><button v-if="project.lifecycle === 'draft' || project.lifecycle === 'active'" :disabled="busy" @click="action(project, 'archived')">归档</button><button v-if="project.lifecycle === 'archived' || project.lifecycle === 'trashed'" :disabled="busy" @click="action(project, 'restore')">恢复</button><button v-if="project.lifecycle !== 'trashed'" :disabled="busy" @click="action(project, 'trashed')">移入垃圾箱</button></div></details></footer></div></article></div>
        <p v-if="!loading && visible.length" class="neo-library-footer">{{ visible.length }} 个工程 · 修改会自动保存，检查点最多保留 20 个。</p>
      </section>
    </div>
    <ImportDialog v-if="importing" v-bind="importing" @close="importing = null" />
  </NeoFrame>
</template>
