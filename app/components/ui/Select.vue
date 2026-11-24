<script setup lang="ts">
export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}
const props = defineProps<{
  label?: string
  options: SelectOption[]
  placeholder?: string
  id?: string
  hideLabel?: boolean
  required?: boolean
  pill?: boolean
  disabled?: boolean
}>()
const model = defineModel<string | null>()
const autoId = useId()
const selectId = computed(() => props.id ?? autoId)
</script>

<template>
  <div class="ui-field">
    <label v-if="label" :for="selectId" class="ui-field__label" :class="{ 'sr-only': hideLabel }">{{ label }}</label>
    <div class="ui-select-wrap" :class="{ pill }">
      <select :id="selectId" v-model="model" class="ui-select" :required="required" :disabled="disabled">
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">{{ o.label }}</option>
      </select>
      <svg class="ui-select__chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </div>
  </div>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.ui-field__label {
  font-size: var(--fs-meta);
  color: var(--ink-2);
  font-weight: 500;
}
.ui-select-wrap {
  position: relative;
  display: flex;
}
.ui-select {
  appearance: none;
  width: 100%;
  height: 36px;
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  padding: 0 30px 0 10px;
  font-size: var(--fs-ui);
  cursor: pointer;
}
.pill .ui-select {
  border-radius: var(--radius-pill);
  height: 30px;
  padding-left: 12px;
}
.ui-select__chev {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--ink-3);
}
@media (max-width: 768px) {
  .ui-select,
  .pill .ui-select {
    height: 44px;
  }
}
</style>
