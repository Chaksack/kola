<script setup lang="ts">
const props = defineProps<{ label?: string; rows?: number; placeholder?: string; id?: string; hint?: string }>()
const model = defineModel<string | null>()
const autoId = useId()
const inputId = computed(() => props.id ?? autoId)
</script>

<template>
  <div class="ui-field">
    <label v-if="label" :for="inputId" class="ui-field__label">{{ label }}</label>
    <textarea :id="inputId" v-model="model" class="ui-textarea" :rows="rows ?? 4" :placeholder="placeholder" />
    <p v-if="hint" class="meta">{{ hint }}</p>
  </div>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ui-field__label {
  font-size: var(--fs-meta);
  color: var(--ink-2);
  font-weight: 500;
}
.ui-textarea {
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: var(--fs-ui);
  resize: vertical;
  outline: none;
}
.ui-textarea:focus {
  border-color: var(--ink-3);
}
</style>
