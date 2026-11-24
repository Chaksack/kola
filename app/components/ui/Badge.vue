<script setup lang="ts">
defineProps<{ mono?: boolean }>()
</script>

<template>
  <span class="ui-badge" :class="{ mono }"><slot /></span>
</template>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 7px;
  background: var(--putty-inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  font-size: var(--fs-meta);
  color: var(--ink);
  white-space: nowrap;
}
</style>
