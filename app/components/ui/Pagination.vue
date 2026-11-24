<script setup lang="ts">
const props = defineProps<{ count: number; limit: number; offset: number; shown: number }>()
const emit = defineEmits<{ change: [offset: number] }>()
const hasPrev = computed(() => props.offset > 0)
const hasNext = computed(() => props.offset + props.limit < props.count)
</script>

<template>
  <nav class="ui-pagination" aria-label="Pagination">
    <p class="meta num">
      Showing {{ count === 0 ? 0 : offset + 1 }}–{{ offset + shown }} of {{ count }}
    </p>
    <div class="row">
      <UiButton size="sm" :disabled="!hasPrev" @click="emit('change', Math.max(0, offset - limit))">Previous</UiButton>
      <UiButton size="sm" :disabled="!hasNext" @click="emit('change', offset + limit)">Next</UiButton>
    </div>
  </nav>
</template>

<style scoped>
.ui-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-top: 1px solid var(--rule);
}
</style>
