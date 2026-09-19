<script setup lang="ts">
import AppHeader from "../../ui/AppHeader.vue";
import "./neo.css";
</script>
<template>
  <AppHeader section="library" />
  <div class="neo-app">
    <main class="neo-main"><slot /></main>
  </div>
</template>
