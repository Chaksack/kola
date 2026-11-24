<script setup lang="ts">
defineProps<{ number: number; title: string; state: 'active' | 'done' | 'todo'; summary?: string }>()
defineEmits<{ edit: [] }>()
</script>

<template>
  <section class="step" :class="`step--${state}`" :aria-current="state === 'active' ? 'step' : undefined">
    <header class="step__head">
      <span class="step__num num" aria-hidden="true">{{ number }}</span>
      <h2 class="step__title">{{ title }}</h2>
      <button v-if="state === 'done'" type="button" class="step__edit" :aria-label="`Edit ${title}`" @click="$emit('edit')">Edit</button>
    </header>
    <p v-if="state === 'done' && summary" class="step__summary">{{ summary }}</p>
    <div v-if="state === 'active'" class="step__body"><slot /></div>
  </section>
</template>

<style scoped>
.step {
  border-bottom: 1px solid var(--rule);
  padding: 20px 0;
}
.step__head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.step__num {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--outline);
  font-size: var(--fs-meta);
  color: var(--ink-2);
}
.step--active .step__num {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);
}
.step--todo .step__title {
  color: var(--ink-3);
}
.step__title {
  font-size: 16px;
}
.step__edit {
  margin-left: auto;
  background: none;
  border: 0;
  padding: 4px;
  font: inherit;
  font-size: var(--fs-ui);
  color: var(--orange-text);
  cursor: pointer;
}
.step__summary {
  margin: 8px 0 0 36px;
  color: var(--ink-2);
  font-size: var(--fs-ui);
}
.step__body {
  margin-top: 16px;
  padding-left: 36px;
}
@media (max-width: 600px) {
  .step__body,
  .step__summary {
    padding-left: 0;
    margin-left: 0;
  }
}
</style>
