<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string
    type?: string
    id?: string
    placeholder?: string
    required?: boolean
    disabled?: boolean
    readonly?: boolean
    name?: string
    mono?: boolean
    autocomplete?: string
    min?: string | number
    max?: string | number
    step?: string | number
    hideLabel?: boolean
    inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'search' | 'url' | 'none'
  }>(),
  { type: 'text' },
)
const model = defineModel<string | number | null>()
const autoId = useId()
const inputId = computed(() => props.id ?? autoId)
</script>

<template>
  <div class="ui-field" :class="{ 'has-error': error }">
    <label v-if="label" :for="inputId" class="ui-field__label" :class="{ 'sr-only': hideLabel }">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <div class="ui-input-wrap">
      <span v-if="$slots.prefix" class="ui-input__affix"><slot name="prefix" /></span>
      <input
        :id="inputId"
        v-model="model"
        class="ui-input"
        :class="{ mono }"
        :type="type"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :readonly="readonly"
        :name="name"
        :autocomplete="autocomplete"
        :min="min"
        :max="max"
        :step="step"
        :inputmode="inputmode"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error || hint ? `${inputId}-desc` : undefined"
      >
      <span v-if="$slots.suffix" class="ui-input__affix"><slot name="suffix" /></span>
    </div>
    <p v-if="error || hint" :id="`${inputId}-desc`" class="ui-field__hint" :class="{ 'text-danger': error }">
      {{ error ?? hint }}
    </p>
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
.ui-field__hint {
  font-size: var(--fs-meta);
  color: var(--ink-3);
}
.ui-input-wrap {
  display: flex;
  align-items: center;
  height: 36px;
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  overflow: hidden;
}
.ui-input-wrap:focus-within {
  border-color: var(--ink-3);
}
.has-error .ui-input-wrap {
  border-color: var(--danger-text);
}
.ui-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  padding: 0 10px;
  font-size: var(--fs-ui);
  outline: none;
}
.ui-input:disabled {
  color: var(--ink-3);
}
.ui-input.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
.ui-input__affix {
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  color: var(--ink-3);
  font-size: var(--fs-meta);
}
@media (max-width: 768px) {
  .ui-input-wrap {
    height: 44px;
  }
}
</style>
