<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";
import JianpuLessonSlide from "../../slide/JianpuLessonSlide.vue";
import type { JianpuPhraseFrame } from "../../slide/types";
import type { ProjectMetadata } from "../project/types";
import { libraryClient } from "../library/LibraryClient";
import type { LibraryCommand } from "../library/LibraryService";
import { useProjectSession } from "../library/useProjectSession";
import type { ProjectView } from "../library/types";
import NeoFrame from "./NeoFrame.vue";
import ImportDialog from "./ImportDialog.vue";
const route = useRoute();
const router = useRouter();
const session = useProjectSession();
const busy = ref(false);
const notice = ref("");
const operationError = ref("");
const importing = ref(false);
const frame = ref<JianpuPhraseFrame | null>(null);
const phraseIndex = ref(0);
const tagsInput = ref<HTMLInputElement>();
const tagsText = ref("");
const checkpointName = ref("");
const blank = ref({ key: "C", meter: "4/4", tempo: 80, measures: 8 });
const view = computed(() => session.view);
const metadata = computed(() => session.metadata);
const disabled = computed(() => busy.value || view.value?.summary.lifecycle === "trashed");
const saveLabels = { clean: "已保存", dirty: "等待保存", saving: "正在保存…", saved: "已保存", conflict: "有版本冲突", error: "保存失败" };
const fields: { key: keyof ProjectMetadata; label: string }[] = [{key:"artist",label:"歌手 / 作者"},{key:"lyricist",label:"作词"},{key:"composer",label:"作曲"},{key:"arranger",label:"编曲"},{key:"otherCredits",label:"其他署名"}];
function updateText(key: keyof ProjectMetadata, event: Event) { session.update({ [key]: (event.target as HTMLInputElement).value }); }
function updateTags(event: Event) {
  tagsText.value = (event.target as HTMLInputElement).value;
  session.update({ tags: tagsText.value.split(/[,，]/).map(value => value.trim()).filter(Boolean) });
}
watch(() => `${view.value?.summary.id}/${view.value?.metadata.tags.join(', ')}`, () => {
  if (document.activeElement !== tagsInput.value) tagsText.value = metadata.value?.tags.join(', ') ?? "";
}, { immediate: true });
watch(() => `${view.value?.summary.id}/${view.value?.metadata.keyAndMeters}/${view.value?.metadata.expression}/${view.value?.summary.measures}`, () => {
  if (!view.value || view.value.source.format !== "简谱空白模板") return;
  blank.value = { key: view.value.metadata.keyAndMeters.match(/1=([^,{}]+)/)?.[1] ?? "C", meter: view.value.metadata.keyAndMeters.match(/(\d+\/\d+)/)?.[1] ?? "4/4", tempo: Number(view.value.metadata.expression.match(/J=(\d+)/)?.[1] ?? 80), measures: view.value.summary.measures };
}, { immediate: true });
let frameRequest = 0;
async function loadFrame() {
  if (!view.value) return;
  const request = ++frameRequest;
  try {
    const result = await libraryClient.request<JianpuPhraseFrame | null>({ method: "frame", id: view.value.summary.id, revision: view.value.summary.revision, index: phraseIndex.value });
    if (request === frameRequest) frame.value = result;
  } catch (failure) { if (request === frameRequest) { frame.value = null; operationError.value = failure instanceof Error ? failure.message : String(failure); } }
}
watch(() => route.params.projectId, async id => { phraseIndex.value = 0; await session.open(String(id)); await loadFrame(); }, { immediate: true });
watch(() => view.value?.summary.revision, () => { phraseIndex.value = Math.min(phraseIndex.value, Math.max(0, (view.value?.phrases.length ?? 1) - 1)); void loadFrame(); });
watch(phraseIndex, () => { void loadFrame(); });
onBeforeRouteLeave(async () => !busy.value && await session.flush());
onBeforeRouteUpdate(async () => !busy.value && await session.flush());
async function operation(command: () => LibraryCommand, success: string) {
  if (!await session.flush()) return;
  busy.value = true; operationError.value = ""; notice.value = "";
  try { session.adopt(await libraryClient.request<ProjectView>(command())); notice.value = success; await loadFrame(); }
  catch (failure) { operationError.value = failure instanceof Error ? failure.message : String(failure); }
  finally { busy.value = false; }
}
async function exportProject() {
  if (!await session.flush() || !view.value) return;
  busy.value = true; operationError.value = "";
  try {
    const result = await libraryClient.request<{ filename: string; bytes: ArrayBuffer; missingAssets: string[] }>({ method: "export", id: view.value.summary.id });
    const url = URL.createObjectURL(new Blob([result.bytes], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = result.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    notice.value = result.missingAssets.length ? `工程已导出，${result.missingAssets.length} 个缺失附件的引用已保留。` : "工程与附件已导出，可重新导入。";
  } catch (failure) { operationError.value = failure instanceof Error ? failure.message : String(failure); }
  finally { busy.value = false; }
}
async function attach(event: Event, assetId?: string) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !view.value) return;
  if (file.size > 64 * 1024 * 1024) { operationError.value = "单个附件最大为 64 MiB。"; input.value = ""; return; }
  const bytes = await file.arrayBuffer();
  await operation(() => ({ method: "asset", id: view.value!.summary.id, revision: view.value!.summary.revision, name: file.name, type: file.type, bytes, ...(assetId ? { assetId } : {}) }), "附件已保存。");
  input.value = "";
}
async function fork() {
  busy.value = true; operationError.value = "";
  try { const result = await session.fork(); busy.value = false; await router.push({ name: "project-edit", params: { projectId: result.summary.id } }); }
  catch (failure) { operationError.value = failure instanceof Error ? failure.message : String(failure); }
  finally { busy.value = false; }
}
async function reload() {
  try { await session.reload(); await loadFrame(); }
  catch (failure) { operationError.value = failure instanceof Error ? failure.message : String(failure); }
}
async function openImport() { if (await session.flush()) importing.value = true; }
</script>
<template>
  <NeoFrame>
    <p v-if="session.loading" class="neo-empty" role="status">正在恢复工程…</p>
    <section v-else-if="!view || !metadata" class="neo-empty"><h1>暂时无法打开工程</h1><p role="alert">{{ session.error }}</p><RouterLink class="neo-primary" to="/library">返回工程库</RouterLink></section>
    <template v-else>
      <section class="neo-editor-heading"><RouterLink to="/library" class="neo-back">← 工程库</RouterLink><span class="neo-save-status" :data-state="session.status" role="status">{{ saveLabels[session.status] }} · 版本 {{ view.summary.revision }}</span><div class="neo-actions"><button :disabled="busy" @click="openImport">导入另一工程</button><button :disabled="busy" @click="exportProject">导出工程包</button><button v-if="view.summary.lifecycle === 'draft'" :disabled="disabled" class="neo-primary" @click="operation(() => ({method:'lifecycle',id:view!.summary.id,revision:view!.summary.revision,lifecycle:'active'}), '工程已加入进行中列表。')">开始使用</button></div></section>
      <p v-if="session.error" role="alert" class="neo-error">{{ session.error }}</p><p v-if="session.journalError" role="alert" class="neo-warning">{{ session.journalError }}</p><p v-if="operationError" role="alert" class="neo-error">{{ operationError }}</p><p v-if="notice" role="status" class="neo-notice">{{ notice }}</p>
      <div v-if="session.status === 'conflict'" class="neo-warning neo-recovery"><p>你的文字修改仍保留在此页和恢复副本中。</p><button :disabled="busy" @click="fork">将我的修改另存为副本</button><button :disabled="busy" @click="reload">放弃这些修改，重新载入</button></div>
      <div v-else-if="session.status === 'error' && session.unsaved" class="neo-recovery"><button :disabled="busy" @click="session.flush">重试保存</button><button :disabled="busy" @click="fork">另存为副本</button></div>
      <div v-if="session.recovery" class="neo-warning neo-recovery"><p>检测到 {{ new Date(session.recovery.updatedAt).toLocaleString() }} 未完成保存的文字修改{{ session.recovery.owner !== session.owner ? '（来自其他页面）' : '' }}。</p><button @click="session.restoreRecovery">恢复这些修改</button><button @click="session.dismissRecovery">忽略此提示</button></div>
      <div v-if="view.summary.lifecycle === 'trashed'" class="neo-warning neo-recovery"><p>此工程在垃圾箱中，内容仍完整保留。</p><button :disabled="busy" @click="operation(() => ({method:'lifecycle',id:view!.summary.id,revision:view!.summary.revision,lifecycle:'restore'}), '工程已恢复。')">恢复工程</button></div>
      <div class="neo-workspace">
        <section class="neo-project-details"><span class="neo-eyebrow">工程信息</span><label class="neo-title-field"><span>工程名称</span><input :value="metadata.title" :disabled="disabled" maxlength="300" placeholder="未命名工程" @input="updateText('title', $event)"></label><div class="neo-form-grid"><label v-for="field in fields" :key="field.key"><span>{{ field.label }}</span><input :value="metadata[field.key]" :disabled="disabled" maxlength="500" @input="updateText(field.key, $event)"></label><label><span>标签（逗号分隔）</span><input ref="tagsInput" :value="tagsText" :disabled="disabled" maxlength="500" @input="updateTags" @blur="tagsText = metadata!.tags.join(', ')"></label></div>
          <details v-if="view.source.format === '简谱空白模板' && view.summary.lifecycle === 'draft'" class="neo-panel"><summary>空白谱设置</summary><p class="neo-muted">调整后点击应用；会先保留当前版本的检查点。</p><div class="neo-form-grid"><label>调号<select v-model="blank.key" :disabled="disabled"><option v-for="key in ['C','D','E','F','G','A','B','Bb','Eb']" :key="key">{{ key }}</option></select></label><label>拍号<select v-model="blank.meter" :disabled="disabled"><option v-for="meter in ['2/4','3/4','4/4','6/8']" :key="meter">{{ meter }}</option></select></label><label>印刷速度<input v-model.number="blank.tempo" :disabled="disabled" type="number" min="20" max="300"></label><label>小节数<input v-model.number="blank.measures" :disabled="disabled" type="number" min="1" max="64"></label></div><button :disabled="disabled" @click="operation(() => ({method:'configure-blank',id:view!.summary.id,revision:view!.summary.revision,input:{...blank,title:metadata!.title,artist:metadata!.artist}}), '空白谱设置已应用。')">应用空白谱设置</button><p class="neo-muted">五线谱与 TAB 模板尚未支持。</p></details>
          <section class="neo-panel"><h2>版本检查点</h2><p class="neo-muted">保存一个便于返回的版本，最多保留最近 20 个。</p><div class="neo-inline-form"><input v-model="checkpointName" aria-label="检查点名称" placeholder="例如：周五课堂前" maxlength="100" :disabled="disabled"><button :disabled="disabled" @click="operation(() => ({method:'checkpoint',id:view!.summary.id,revision:view!.summary.revision,name:checkpointName || '命名版本'}), '检查点已保存。')">保存检查点</button></div><ul class="neo-checkpoints"><li v-for="checkpoint in view.checkpoints" :key="checkpoint.key"><span><strong>{{ checkpoint.name }}</strong><small>版本 {{ checkpoint.revision }} · {{ new Date(checkpoint.createdAt).toLocaleString() }}</small></span><button :disabled="disabled" @click="operation(() => ({method:'restore-checkpoint',id:view!.summary.id,revision:view!.summary.revision,key:checkpoint.key}), '已恢复检查点，恢复前的版本也已保留。')">恢复</button></li></ul></section>
          <section class="neo-panel"><h2>附件</h2><label class="neo-attachment-add">添加音频或其他附件<input type="file" :disabled="disabled" @change="attach($event)"></label><ul class="neo-assets"><li v-for="asset in view.assets" :key="asset.id"><span>{{ asset.name }} <small>{{ asset.missing ? '文件缺失' : '已保存在本机' }}</small></span><label v-if="asset.missing">补充原文件<input type="file" :disabled="disabled" @change="attach($event, asset.id)"></label></li></ul><p v-if="!view.assets.length" class="neo-muted">尚未添加附件。</p></section>
        </section>
        <section class="neo-preview-panel"><div class="neo-preview-heading"><div><span class="neo-eyebrow">谱面预览</span><h2>{{ metadata.title || '未命名工程' }}</h2></div><span>{{ view.summary.measures }} 小节 · {{ view.summary.phrases }} 乐句</span></div><div class="neo-score-stage"><JianpuLessonSlide v-if="frame" :phrase="frame" :active-slot="-1" :show-metronome="false" /><div v-else class="neo-empty">这份工程暂时没有可显示的谱面片段。</div></div><div class="neo-phrase-navigation"><button :disabled="phraseIndex <= 0" @click="phraseIndex--">← 上一片段</button><span>{{ view.phrases.length ? phraseIndex + 1 : 0 }} / {{ view.phrases.length }}</span><button :disabled="phraseIndex >= view.phrases.length - 1" @click="phraseIndex++">下一片段 →</button></div><label class="neo-phrase-select">选择片段<select v-model.number="phraseIndex"><option v-for="(phrase,index) in view.phrases" :key="phrase.id" :value="index">{{ index + 1 }} · {{ phrase.text }}</option></select></label><p class="neo-muted">此处可核对已保存的谱面。音符与教学内容编辑将在后续工作台中接入。</p>
          <details class="neo-panel"><summary>来源与导入检查</summary><dl class="neo-facts"><div><dt>原文件</dt><dd>{{ view.source.filename }}</dd></div><div><dt>格式</dt><dd>{{ view.source.format }} · {{ view.source.encoding }}</dd></div><div><dt>调号 / 拍号</dt><dd>{{ metadata.keyAndMeters }} · {{ metadata.expression }}</dd></div></dl><p v-if="view.preservation" class="neo-muted">保留 {{ view.preservation.counts.preserved }} 项 · 近似 {{ view.preservation.counts.approximated }} 项 · 不支持 {{ view.preservation.counts.unsupported }} 项 · 缺失 {{ view.preservation.counts.missing }} 项。完整来源和报告随工程导出。</p><ul class="neo-diagnostics"><li v-for="item in view.diagnostics" :key="item.id">{{ item.severity }} · {{ item.message }}</li></ul></details>
        </section>
      </div>
    </template>
    <ImportDialog v-if="importing" @close="importing = false" />
  </NeoFrame>
</template>
