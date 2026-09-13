<script setup lang="ts">
import { RouterLink } from "vue-router";
import "./neo.css";
</script>
<template>
  <div class="neo-app">
    <header class="neo-header">
      <RouterLink class="neo-brand" to="/library"><span class="neo-brand-mark" aria-hidden="true">♪</span><span>Music Teach<small>教学工程</small></span></RouterLink>
      <nav aria-label="主导航"><RouterLink to="/library">工程库</RouterLink><RouterLink to="/scores/sakura">歌曲教学</RouterLink><RouterLink to="/legacy/projects/new">旧版编辑器</RouterLink></nav>
      <span class="neo-local"><span aria-hidden="true">●</span> 保存在本机</span>
    </header>
    <main class="neo-main"><slot /></main>
  </div>
</template>
