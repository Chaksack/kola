<script setup lang="ts">
export interface TabItem {
  value: string
  label: string
  count?: number
}
defineProps<{ items: TabItem[]; label?: string }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="ui-tabs" role="tablist" :aria-label="label ?? 'Filter'">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      role="tab"
      class="ui-tab"
      :aria-selected="model === item.value"
      @click="model = item.value"
    >
      {{ item.label }}
      <span v-if="item.count !== undefined" class="ui-tab__count num">{{ item.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.ui-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ui-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--outline);
  background: transparent;
  color: var(--ink-2);
  font-size: var(--fs-ui);
  cursor: pointer;
}
.ui-tab:hover {
  background: var(--putty-inset);
}
.ui-tab[aria-selected='true'] {
  background: var(--control);
  border-color: var(--control);
  color: var(--ink);
}
.ui-tab__count {
  color: var(--ink-3);
  font-size: var(--fs-meta);
}
@media (max-width: 768px) {
  .ui-tab {
    min-height: 44px;
  }
}
</style>
