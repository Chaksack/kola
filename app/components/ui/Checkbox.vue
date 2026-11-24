<script setup lang="ts">
defineProps<{ label: string; hint?: string; disabled?: boolean }>()
const model = defineModel<boolean>()
</script>

<template>
  <label class="ui-check" :class="{ 'is-disabled': disabled }">
    <input v-model="model" type="checkbox" :disabled="disabled">
    <span class="ui-check__box" aria-hidden="true">
      <svg v-if="model" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5" /></svg>
    </span>
    <span class="ui-check__text">
      {{ label }}
      <span v-if="hint" class="meta">{{ hint }}</span>
    </span>
  </label>
</template>

<style scoped>
.ui-check {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  font-size: var(--fs-ui);
  cursor: pointer;
  position: relative;
  min-height: 20px;
}
.ui-check input {
  position: absolute;
  opacity: 0;
  width: 16px;
  height: 16px;
  margin: 0;
}
.ui-check__box {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--paper);
}
.ui-check input:checked + .ui-check__box {
  background: var(--ink);
  border-color: var(--ink);
}
.ui-check input:focus-visible + .ui-check__box {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.ui-check__text {
  display: flex;
  flex-direction: column;
}
.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
