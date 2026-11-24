<script setup lang="ts">
export interface ProductCardData {
  id: string
  title: string
  handle: string
  subtitle: string | null
  thumbnail: string | null
  collection: { title: string; handle: string } | null
  price: { amount: number; originalAmount: number; currencyCode: string } | null
  priceVaries: boolean
  inStock: boolean
}
defineProps<{ product: ProductCardData; eager?: boolean }>()
</script>

<template>
  <article class="card">
    <NuxtLink :to="`/products/${product.handle}`" class="card__link">
      <StoreImage :src="product.thumbnail" :alt="product.title" :seed="product.handle" :eager="eager" />
      <div class="card__body">
        <h3 class="card__title">{{ product.title }}</h3>
        <p v-if="product.subtitle" class="card__sub">{{ product.subtitle }}</p>
        <div class="card__meta">
          <StorePrice :price="product.price" :from="product.priceVaries" />
          <span v-if="!product.inStock" class="meta">Sold out</span>
        </div>
      </div>
    </NuxtLink>
  </article>
</template>

<style scoped>
.card {
  background: var(--putty);
  border-radius: var(--radius);
  padding: 8px 8px 14px;
  min-width: 0;
}
.card__link {
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-decoration: none;
}
.card__link:hover .card__title {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.card__body {
  padding: 0 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card__title {
  font-size: 14px;
  font-weight: 400;
}
.card__sub {
  font-size: var(--fs-meta);
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card__meta {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--fs-ui);
}
</style>
