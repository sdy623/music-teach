<script setup lang="ts">
import SvgPage from "../render/SvgPage.vue";
import type { PageLayout } from "../layout/types";

defineProps<{
  pages: PageLayout[];
  zoom: number;
  pageMode: boolean;
}>();
</script>

<template>
  <div class="page-viewport" :class="{ 'page-mode': pageMode }">
    <div v-for="page in pages" :key="page.pageNumber" class="page-shell" :style="{ width: `${210 * zoom}mm` }">
      <SvgPage :page="page" />
    </div>
  </div>
</template>

