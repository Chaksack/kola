<script setup lang="ts">
import { formatMoney } from '#shared/utils/money'

defineProps<{ compact?: boolean }>()
const cartStore = useCartStore()
const cart = computed(() => cartStore.cart)

async function setQty(lineId: string, q: number) {
  try {
    await cartStore.update(lineId, q)
  } catch {
    // message shown via cartStore.error
  }
}
</script>

<template>
  <ul v-if="cart?.items.length" class="lines" :class="{ compact }">
    <li v-for="item in cart.items" :key="item.id" class="line">
      <NuxtLink :to="`/products/${item.productHandle}`" class="line__img" tabindex="-1" aria-hidden="true">
        <StoreImage :src="item.thumbnail" :alt="item.title" :seed="item.productHandle ?? item.title" ratio="1" sizes="96px" />
      </NuxtLink>
      <div class="line__body">
        <div class="line__top">
          <div>
            <NuxtLink :to="`/products/${item.productHandle}`" class="line__title">{{ item.title }}</NuxtLink>
            <p class="meta">{{ item.variantTitle }}</p>
          </div>
          <span class="num">{{ formatMoney(item.total, cart.currencyCode) }}</span>
        </div>
        <div class="line__bottom">
          <StoreQuantityStepper
            :model-value="item.quantity"
            :label="`quantity of ${item.title}`"
            size="sm"
            :disabled="cartStore.busy"
            @update:model-value="setQty(item.id, $event)"
          />
          <span class="meta num">{{ formatMoney(item.unitPrice, cart.currencyCode) }} each</span>
          <button type="button" class="line__remove" :disabled="cartStore.busy" @click="cartStore.remove(item.id)">Remove</button>
        </div>
        <p v-if="item.discountTotal" class="meta text-ok">Saved {{ formatMoney(item.discountTotal, cart.currencyCode) }}</p>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.lines {
  list-style: none;
  margin: 0;
  padding: 0;
}
.line {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 14px;
  padding: 16px 0;
  border-bottom: 1px solid var(--rule);
}
.compact .line {
  grid-template-columns: 64px 1fr;
}
.line:first-child {
  padding-top: 0;
}
.line__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.line__top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.line__title {
  color: var(--ink);
}
.line__bottom {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.line__remove {
  margin-left: auto;
  background: none;
  border: 0;
  padding: 0;
  color: var(--ink-3);
  font: inherit;
  font-size: var(--fs-meta);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.line__remove:hover {
  color: var(--ink);
}
</style>
