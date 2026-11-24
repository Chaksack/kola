<script setup lang="ts">
import type { StoreOrderData } from '~/components/store/OrderView.vue'

definePageMeta({ middleware: 'customer-auth' })
useSeoMeta({ title: 'Order · Kola Market', robots: 'noindex' })
const route = useRoute()
const order = ref<StoreOrderData | null>(null)
const failed = ref(false)
onMounted(async () => {
  try {
    order.value = (await storeFetch<{ order: StoreOrderData }>(`/api/store/customers/me/orders/${route.params.id}`)).order
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <div class="detail">
    <NuxtLink to="/account" class="meta">← All orders</NuxtLink>
    <StoreOrderView v-if="order" :order="order" />
    <p v-else-if="failed" class="text-danger">Order not found.</p>
    <p v-else class="meta">Loading…</p>
  </div>
</template>

<style scoped>
.detail {
  max-width: 820px;
  padding-top: 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
