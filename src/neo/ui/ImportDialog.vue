<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { libraryClient } from "../library/LibraryClient";
import { useProjectSession } from "../library/useProjectSession";
import type { ImportInput, ImportPreview, ProjectView } from "../library/types";
import ScoreThumbnail from "./ScoreThumbnail.vue";
const props = defineProps<{ fixture?: string; legacyKey?: string }>();
const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const session = useProjectSession();
const dialog = ref<HTMLDialogElement>();
const busy = ref(false);
const error = ref("");
const preview = ref<ImportPreview | null>(null);
const filename = ref("");
const canonicalNeeded = ref(false);
let input: ImportInput | null = null;
let committed = false;
async function prepare() {
  if (!input) return;
  busy.value = true; error.value = ""; preview.value = null;
  try { preview.value = await libraryClient.request<ImportPreview>({ method: "prepare", input }); canonicalNeeded.value = false; }
  catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); canonicalNeeded.value = (failure as { code?: string }).code === "canonical-required"; }
  finally { busy.value = false; }
}
async function choose(event: Event, canonical = false) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    if (canonical && input) input = { ...input, canonicalBytes: await file.arrayBuffer() };
    else { filename.value = file.name; input = { filename: file.name, bytes: await file.arrayBuffer() }; }
    await prepare();
  } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); }
  finally { busy.value = false; }
}
async function commit() {
  if (!preview.value || busy.value) return;
  busy.value = true; error.value = "";
  try {
    const legacyText = props.legacyKey ? localStorage.getItem(props.legacyKey) ?? undefined : undefined;
    const view = await libraryClient.request<ProjectView>({ method: "commit", token: preview.value.token, ...(legacyText === undefined ? {} : { legacyText }) });
    committed = true;
    session.adopt(view);
    emit("close");
    await router.push({ name: "project-edit", params: { projectId: view.summary.id } });
  } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); }
  finally { busy.value = false; }
}
function cancel(event?: Event) { if (busy.value) { event?.preventDefault(); return; } emit("close"); }
onMounted(async () => {
  dialog.value?.showModal();
  try {
    if (props.fixture) {
      busy.value = true;
      const url = `${import.meta.env.BASE_URL}fixtures/${encodeURIComponent(props.fixture)}.jpwabc`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`无法读取示例（${response.status}）。`);
      filename.value = `${props.fixture}.jpwabc`;
      input = { filename: filename.value, bytes: await response.arrayBuffer() };
      await prepare();
    } else if (props.legacyKey) {
      const text = localStorage.getItem(props.legacyKey);
      if (text === null) throw new Error("旧工程已不存在，请刷新列表。");
      filename.value = "本机旧工程.json";
      input = { filename: filename.value, bytes: new TextEncoder().encode(text).buffer, legacyKey: props.legacyKey };
      await prepare();
    }
  } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); busy.value = false; }
});
onBeforeUnmount(() => { dialog.value?.close(); if (!committed) void libraryClient.request({ method: "discard" }).catch(() => {}); });
</script>
<template>
  <dialog ref="dialog" class="neo-dialog" aria-labelledby="import-heading" @cancel="cancel">
    <div class="neo-dialog-heading"><div><span class="neo-eyebrow">导入工程</span><h2 id="import-heading">先检查，再加入工程库</h2></div><button aria-label="关闭导入" :disabled="busy" @click="cancel">×</button></div>
    <p class="neo-muted">支持 JPW-ABC、Music Teach 工程包和旧版工程 JSON。导入创建独立工程，原文件继续保留。</p>
    <label v-if="!props.fixture && !props.legacyKey" class="neo-file-drop">选择工程或谱面文件<input type="file" accept=".json,.jpwabc,.abc,.txt" :disabled="busy" @change="choose($event)"></label>
    <p v-if="filename" class="neo-filename">{{ filename }}</p>
    <p v-if="busy" role="status" class="neo-notice">{{ preview ? '正在保存并重新读取核验…' : '正在后台解析谱面和检查保留内容…' }}</p>
    <p v-if="error" role="alert" class="neo-error">{{ error }}</p>
    <label v-if="canonicalNeeded" class="neo-file-drop">选择配对的原始 JPW-ABC<input type="file" accept=".jpwabc,.abc,.txt" :disabled="busy" @change="choose($event, true)"></label>
    <section v-if="preview" class="neo-import-preview">
      <ScoreThumbnail :frame="preview.summary.thumbnail" />
      <h3>{{ preview.summary.title }}</h3>
      <dl class="neo-facts"><div><dt>格式 / 编码</dt><dd>{{ preview.format }} · {{ preview.encoding }}</dd></div><div><dt>内容</dt><dd>{{ preview.summary.measures }} 小节 · {{ preview.summary.phrases }} 乐句 · {{ preview.lyricLayers }} 歌词层</dd></div><div><dt>调性 / 拍号 / 速度</dt><dd>{{ preview.keyAndMeters }} · {{ preview.expression }}</dd></div><div><dt>工程记录</dt><dd>{{ (preview.recordBytes / 1024 / 1024).toFixed(2) }} MiB</dd></div></dl>
      <p v-if="preview.preservation" class="neo-notice">字段检查：保留 {{ preview.preservation.counts.preserved }} 项，近似 {{ preview.preservation.counts.approximated }} 项，不支持 {{ preview.preservation.counts.unsupported }} 项，缺失 {{ preview.preservation.counts.missing }} 项。原始来源随工程保存。</p>
      <p v-if="preview.missingAssets.length" class="neo-warning">缺少 {{ preview.missingAssets.length }} 个附件：{{ preview.missingAssets.join('、') }}。引用会保留，可在工程内补充。</p>
      <details v-if="preview.diagnostics.length || preview.preservation"><summary>查看诊断与字段保留明细</summary><ul class="neo-diagnostics"><li v-for="item in preview.diagnostics" :key="item.id">{{ item.severity }} · {{ item.message }}</li><li v-for="item in preview.preservation?.entries" :key="item.path + item.code">{{ item.disposition }} · {{ item.path }} — {{ item.message }}</li></ul></details>
      <p v-if="preview.existingProjectId" class="neo-notice">此旧工程已经迁入过，将打开已有工程，不再创建重复副本。</p>
      <p class="neo-muted neo-id">{{ preview.existingProjectId ? '已迁入工程 ID' : '新工程 ID' }}：{{ preview.existingProjectId || preview.summary.id }}</p>
    </section>
    <footer class="neo-dialog-actions"><button :disabled="busy" @click="cancel">取消</button><button class="neo-primary" :disabled="!preview || busy" @click="commit">{{ preview?.existingProjectId ? '打开已迁入工程' : '确认导入并打开' }}</button></footer>
  </dialog>
</template>
