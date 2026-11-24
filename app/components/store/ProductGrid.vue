<script setup lang="ts">
import type { ProductCardData } from './ProductCard.vue'

withDefaults(defineProps<{ products: ProductCardData[]; columns?: number; eagerCount?: number }>(), { columns: 4, eagerCount: 0 })
</script>

<template>
  <ul class="grid" :style="{ '--cols': columns }">
    <li v-for="(p, i) in products" :key="p.id">
      <StoreProductCard :product="p" :eager="i < eagerCount" />
    </li>
  </ul>
</template>

<style scoped>
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--gutter);
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
}
@media (max-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
