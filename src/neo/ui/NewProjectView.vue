<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { libraryClient } from "../library/LibraryClient";
import { useProjectSession } from "../library/useProjectSession";
import type { ProjectView } from "../library/types";
import NeoFrame from "./NeoFrame.vue";
const router = useRouter();
const session = useProjectSession();
const error = ref("");
const busy = ref(false);
let active = true;
async function create() {
  if (busy.value) return;
  busy.value = true; error.value = "";
  try {
    const view = await libraryClient.request<ProjectView>({ method: "create", input: { title: "未命名工程", artist: "", key: "C", meter: "4/4", tempo: 80, measures: 8 } });
    if (!active) return;
    session.adopt(view);
    await router.replace({ name: "project-edit", params: { projectId: view.summary.id } });
  } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); }
  finally { busy.value = false; }
}
onMounted(create);
onBeforeUnmount(() => { active = false; });
</script>
<template><NeoFrame><section class="neo-empty" aria-live="polite"><h1>{{ busy ? '正在建立草稿' : '草稿尚未建立' }}</h1><p v-if="busy">先保存工程，再开始编辑。</p><p v-if="error" role="alert">{{ error }}</p><button v-if="error" class="neo-primary" @click="create">重试</button><RouterLink v-if="error" to="/library">返回工程库</RouterLink></section></NeoFrame></template>
