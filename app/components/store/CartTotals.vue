<script setup lang="ts">
import { formatMoney } from '#shared/utils/money'

defineProps<{ showShipping?: boolean }>()
const cartStore = useCartStore()
const cart = computed(() => cartStore.cart)
const fmt = (n: number) => formatMoney(n, cart.value?.currencyCode ?? 'GHS')
</script>

<template>
  <dl v-if="cart" class="dl">
    <dt>Subtotal</dt>
    <dd>{{ fmt(cart.totals.itemSubtotal) }}</dd>
    <template v-for="p in cart.promotions" :key="p.code">
      <dt>Discount <span class="mono">{{ p.code }}</span></dt>
      <dd class="text-ok">−{{ fmt(p.amount) }}</dd>
    </template>
    <template v-if="showShipping">
      <dt>Shipping</dt>
      <dd>{{ cart.shippingMethods.length ? fmt(cart.totals.shippingTotal) : 'Calculated at checkout' }}</dd>
    </template>
    <dt>Tax{{ cart.region.taxInclusive ? ' (included)' : '' }}</dt>
    <dd>{{ fmt(cart.totals.taxTotal) }}</dd>
    <dt class="dl-total">Total</dt>
    <dd class="dl-total">{{ fmt(cart.totals.total) }}</dd>
  </dl>
</template>
