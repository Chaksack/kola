<script setup lang="ts">
/** Product media on a stage-colour backing. Uses @nuxt/image for real URLs, a plain <img> for data: URLs. */
const props = withDefaults(defineProps<{ src?: string | null; alt?: string; seed?: string; ratio?: string; sizes?: string; eager?: boolean }>(), { ratio: '4 / 5', sizes: '(max-width: 768px) 50vw, 25vw' })
const stages = ['warm', 'stone', 'sage', 'blue'] as const
const stage = computed(() => {
  let h = 0
  for (const c of props.seed ?? props.alt ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return stages[h % stages.length]
})
const isData = computed(() => Boolean(props.src?.startsWith('data:')))
</script>

<template>
  <div class="store-img" :style="{ aspectRatio: ratio, background: `var(--stage-${stage})` }">
    <template v-if="src">
      <img v-if="isData" :src="src" :alt="alt ?? ''" :loading="eager ? 'eager' : 'lazy'" decoding="async">
      <NuxtImg v-else :src="src" :alt="alt ?? ''" :sizes="sizes" :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : undefined" format="webp" />
    </template>
    <span v-else class="store-img__mark" aria-hidden="true">{{ (alt ?? 'K').charAt(0) }}</span>
  </div>
</template>

<style scoped>
.store-img {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius);
  display: grid;
  place-items: center;
}
.store-img :deep(img) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.store-img__mark {
  font-size: 48px;
  letter-spacing: -0.03em;
  color: var(--ink-60);
  opacity: 0.35;
}
</style>
