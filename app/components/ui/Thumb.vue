<script setup lang="ts">
const props = defineProps<{ src?: string | null; alt?: string; size?: number; stage?: 'warm' | 'stone' | 'sage' | 'blue'; seed?: string }>()
const stages = ['warm', 'stone', 'sage', 'blue'] as const
const stageName = computed(() => {
  if (props.stage) return props.stage
  const s = props.seed ?? props.alt ?? ''
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return stages[h % stages.length]
})
</script>

<template>
  <span class="ui-thumb" :style="{ width: `${size ?? 40}px`, height: `${size ?? 40}px`, background: `var(--stage-${stageName})` }">
    <img v-if="src" :src="src" :alt="alt ?? ''" loading="lazy">
  </span>
</template>

<style scoped>
.ui-thumb {
  display: inline-flex;
  flex: none;
  border-radius: var(--radius);
  overflow: hidden;
}
.ui-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
