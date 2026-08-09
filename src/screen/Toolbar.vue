<script setup lang="ts">
defineProps<{
  scoreId: string;
  zoom: number;
  pageMode: boolean;
  phraseMode: boolean;
  teachingGhost: boolean;
  showKeyChanges: boolean;
  showReadingOverrides: boolean;
}>();

const emit = defineEmits<{
  "update:scoreId": [value: string];
  "update:zoom": [value: number];
  "update:pageMode": [value: boolean];
  "update:phraseMode": [value: boolean];
  "update:teachingGhost": [value: boolean];
  "update:showKeyChanges": [value: boolean];
  "update:showReadingOverrides": [value: boolean];
}>();

const scores = [
  { id: "sakura", label: "さくら" },
  { id: "notation-reference", label: "Notation reference" },
  { id: "rhythm-x", label: "Rhythm X" }
];
</script>

<template>
  <div class="toolbar">
    <label class="toolbar-field">
      <span>Score</span>
      <select :value="scoreId" @change="emit('update:scoreId', ($event.target as HTMLSelectElement).value)">
        <option v-for="score in scores" :key="score.id" :value="score.id">{{ score.label }}</option>
      </select>
    </label>
    <label class="toolbar-field zoom-field">
      <span>Zoom</span>
      <input
        type="range"
        min="0.45"
        max="2"
        step="0.05"
        :value="zoom"
        @input="emit('update:zoom', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <label class="toggle">
      <input type="checkbox" :checked="pageMode" @change="emit('update:pageMode', ($event.target as HTMLInputElement).checked)" />
      Page
    </label>
    <label class="toggle">
      <input
        type="checkbox"
        :checked="phraseMode"
        @change="emit('update:phraseMode', ($event.target as HTMLInputElement).checked)"
      />
      Phrase
    </label>
    <label class="toggle">
      <input
        type="checkbox"
        :checked="teachingGhost"
        @change="emit('update:teachingGhost', ($event.target as HTMLInputElement).checked)"
      />
      Tie ghost
    </label>
    <label class="toggle">
      <input
        type="checkbox"
        :checked="showKeyChanges"
        @change="emit('update:showKeyChanges', ($event.target as HTMLInputElement).checked)"
      />
      Key
    </label>
    <label class="toggle">
      <input
        type="checkbox"
        :checked="showReadingOverrides"
        @change="emit('update:showReadingOverrides', ($event.target as HTMLInputElement).checked)"
      />
      Reading
    </label>
  </div>
</template>
