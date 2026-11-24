<script setup lang="ts">
const props = defineProps<{ name?: string | null; size?: number }>()
const initials = computed(() =>
  (props.name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join(''),
)
</script>

<template>
  <span class="ui-avatar" :style="{ width: `${size ?? 28}px`, height: `${size ?? 28}px`, fontSize: `${Math.round((size ?? 28) * 0.4)}px` }" aria-hidden="true">
    {{ initials }}
  </span>
</template>

<style scoped>
.ui-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 50%;
  background: var(--control);
  color: var(--ink-2);
  font-weight: 500;
}
</style>
