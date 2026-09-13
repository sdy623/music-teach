<script setup lang="ts">
import { useRoute } from "vue-router";
import TeachingProjectStudio from "../../project/TeachingProjectStudio.vue";
import ProjectEditorView from "./ProjectEditorView.vue";
const route = useRoute();
</script>
<template><ProjectEditorView v-if="String(route.params.projectId).startsWith('neo-')" /><TeachingProjectStudio v-else /></template>
