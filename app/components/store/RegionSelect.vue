<script setup lang="ts">
const { regions, region, setRegion } = useRegion()
const cartStore = useCartStore()
const id = useId()

async function change(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  setRegion(value)
  try {
    await cartStore.setRegion(value)
  } catch {
    // shown by cart store
  }
}
</script>

<template>
  <label v-if="regions.length > 1" class="region" :for="id">
    <span class="sr-only">Region and currency</span>
    <select :id="id" :value="region?.id" @change="change">
      <option v-for="r in regions" :key="r.id" :value="r.id">{{ r.name }} · {{ r.currencyCode }}</option>
    </select>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
  </label>
</template>

<style scoped>
.region {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.region select {
  appearance: none;
  height: 32px;
  padding: 0 26px 0 12px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-size: var(--fs-ui);
  color: var(--ink-2);
  cursor: pointer;
}
.region svg {
  position: absolute;
  right: 10px;
  pointer-events: none;
  color: var(--ink-3);
}
</style>
