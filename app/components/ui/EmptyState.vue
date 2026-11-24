<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="ui-empty">
    <p class="ui-empty__title">{{ title }}</p>
    <p v-if="description" class="meta">{{ description }}</p>
    <div v-if="$slots.default" class="ui-empty__actions"><slot /></div>
  </div>
</template>

<style scoped>
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 16px;
  text-align: center;
}
.ui-empty__title {
  font-size: var(--fs-body);
  font-weight: 500;
}
.ui-empty__actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
</style>
