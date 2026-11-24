<script setup lang="ts">
const props = withDefaults(defineProps<{ label: string; min?: number; max?: number; disabled?: boolean; size?: 'sm' | 'md' }>(), { min: 1, max: 99, size: 'md' })
const model = defineModel<number>({ required: true })
const set = (v: number) => (model.value = Math.min(props.max, Math.max(props.min, v)))
</script>

<template>
  <div class="stepper" :class="`stepper--${size}`" role="group" :aria-label="label">
    <button type="button" :disabled="disabled || model <= min" :aria-label="`Decrease ${label}`" @click="set(model - 1)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14" /></svg>
    </button>
    <output class="num" aria-live="polite">{{ model }}</output>
    <button type="button" :disabled="disabled || model >= max" :aria-label="`Increase ${label}`" @click="set(model + 1)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-pill);
  background: var(--paper);
}
.stepper button {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  background: none;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
}
.stepper--sm button {
  width: 30px;
  height: 30px;
}
.stepper button:hover:not(:disabled) {
  background: var(--putty-inset);
}
.stepper button:disabled {
  color: var(--ink-3);
  cursor: not-allowed;
}
.stepper output {
  min-width: 24px;
  text-align: center;
  font-size: var(--fs-ui);
}
@media (max-width: 768px) {
  .stepper button {
    width: 44px;
    height: 44px;
  }
}
</style>
