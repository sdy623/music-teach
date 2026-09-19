<script setup lang="ts">
import { RouterLink } from "vue-router";
import { demoFixtures } from "../demo/fixtures";
import "./theme.css";

defineProps<{ section: "library" | "teaching" | "legacy" }>();
const brandIcon = `${import.meta.env.BASE_URL}favicon.svg`;
const teachingRoute = { name: "score", params: { scoreId: demoFixtures[0]!.id } };
</script>

<template>
  <header class="app-header">
    <RouterLink class="app-brand" to="/library" aria-label="Music Teach 工程库">
      <img class="app-brand-mark" :src="brandIcon" alt="" width="32" height="32" />
      <span>Music Teach<small>乐句教学 · 工程编辑</small></span>
    </RouterLink>
    <nav class="app-navigation" aria-label="主导航">
      <RouterLink to="/library" :class="{ 'is-active': section === 'library' }" :aria-current="section === 'library' ? 'page' : undefined">工程库</RouterLink>
      <RouterLink :to="teachingRoute" :class="{ 'is-active': section === 'teaching' }" :aria-current="section === 'teaching' ? 'page' : undefined">乐句教学</RouterLink>
      <RouterLink to="/legacy/projects/new" :class="{ 'is-active': section === 'legacy' }" :aria-current="section === 'legacy' ? 'page' : undefined">旧版编辑器</RouterLink>
    </nav>
    <span class="app-local"><span aria-hidden="true">●</span> 本机工作区</span>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  min-height: var(--mt-nav-height);
  align-items: center;
  gap: 36px;
  padding: 10px 28px;
  border-bottom: 1px solid var(--mt-line);
  background: var(--mt-header);
  color: var(--mt-text);
  color-scheme: dark;
  font-family: var(--header-font-family);
}
.app-brand { display: flex; align-items: center; gap: 10px; color: inherit; font-size: 17px; font-weight: 800; text-decoration: none; white-space: nowrap; }
.app-brand small { display: block; color: var(--mt-muted); font-size: 10px; font-weight: 500; letter-spacing: .5px; }
.app-brand-mark { display: block; width: 32px; height: 32px; flex-shrink: 0; }
.app-navigation { display: flex; align-items: center; gap: 6px; }
.app-navigation a { display: flex; min-height: 36px; align-items: center; padding: 0 14px; border-radius: var(--mt-radius); color: var(--mt-muted); font-size: 12px; text-decoration: none; white-space: nowrap; }
.app-navigation a:hover { background: var(--mt-hover); color: var(--mt-text); }
.app-navigation a.is-active { background: var(--mt-selected); color: var(--mt-accent); box-shadow: inset 0 -2px var(--mt-accent); }
.app-header a:focus-visible { outline: 2px solid var(--mt-accent); outline-offset: 2px; }
.app-local { margin-left: auto; color: var(--mt-muted); font-size: 11px; white-space: nowrap; }
.app-local span { margin-right: 6px; color: var(--mt-accent); font-size: 8px; }
@media (max-width: 980px) { .app-header { gap: 20px; padding-inline: 18px; } .app-local { display: none; } }
@media (max-width: 760px) {
  .app-header { flex-wrap: wrap; gap: 6px; padding: 10px 18px; }
  .app-brand { width: 100%; }
  .app-brand small { display: none; }
  .app-navigation { width: 100%; }
  .app-navigation a { min-height: 34px; padding-inline: 12px; }
}
</style>
