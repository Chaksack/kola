<script setup lang="ts">
import type { StoreOrderData } from '~/components/store/OrderView.vue'

useSeoMeta({ title: 'Order confirmed · Kola Market', robots: 'noindex' })
const route = useRoute()
const order = ref<StoreOrderData | null>(null)
const failed = ref(false)

onMounted(async () => {
  let email = String(route.query.email ?? '')
  if (!email) {
    try {
      const last = JSON.parse(sessionStorage.getItem('kola_last_order') ?? 'null') as { id: string; email: string } | null
      if (last && last.id === route.params.id) email = last.email
    } catch {
      // ignore
    }
  }
  try {
    const res = await storeFetch<{ order: StoreOrderData }>(`/api/store/orders/${route.params.id}`, { query: { email } })
    order.value = res.order
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <div class="confirmed">
    <template v-if="order">
      <header class="confirmed__head">
        <p class="eyebrow">Thank you</p>
        <h1 class="section-heading">
          Your order is confirmed.
          <span class="heading-second">We've emailed a receipt to {{ order.email }}.</span>
        </h1>
      </header>
      <StoreOrderView :order="order" />
      <div class="row">
        <UiButton variant="primary" to="/shop">Continue shopping</UiButton>
        <UiButton to="/account">View your account</UiButton>
      </div>
    </template>
    <div v-else-if="failed" class="stack">
      <h1 class="section-heading">We couldn't show this order.</h1>
      <p class="muted">Check the link in your confirmation email, or <NuxtLink to="/order/lookup">look up your order</NuxtLink>.</p>
    </div>
    <p v-else class="meta">Loading your order…</p>
  </div>
</template>

<style scoped>
.confirmed {
  max-width: 820px;
  padding-top: 48px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.confirmed__head .section-heading {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
}
</style>
