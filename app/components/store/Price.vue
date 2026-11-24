<script setup lang="ts">
import { formatMoney } from '#shared/utils/money'

defineProps<{ price: { amount: number; originalAmount?: number; currencyCode: string } | null; from?: boolean }>()
</script>

<template>
  <span v-if="price" class="price num">
    <span v-if="from" class="price__from">From </span>
    <span :class="{ 'price__sale': price.originalAmount && price.originalAmount > price.amount }">{{ formatMoney(price.amount, price.currencyCode) }}</span>
    <s v-if="price.originalAmount && price.originalAmount > price.amount" class="price__was">{{ formatMoney(price.originalAmount, price.currencyCode) }}</s>
  </span>
  <span v-else class="price muted">Unavailable</span>
</template>

<style scoped>
.price {
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
}
.price__from {
  color: var(--ink-3);
}
.price__was {
  color: var(--ink-3);
  font-size: 0.92em;
}
</style>
