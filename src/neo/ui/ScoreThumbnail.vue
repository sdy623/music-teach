<script setup lang="ts">
import JianpuLessonSlide from "../../slide/JianpuLessonSlide.vue";
import type { JianpuPhraseFrame } from "../../slide/types";
defineProps<{ frame: JianpuPhraseFrame | null }>();
</script>
<template>
  <div class="neo-thumbnail" aria-hidden="true">
    <JianpuLessonSlide v-if="frame" :phrase="frame" :active-slot="-1" :show-metronome="false" />
    <div v-else class="neo-score-empty"><span>1　2　3　5</span><small>暂无可预览的谱面</small></div>
  </div>
</template>
