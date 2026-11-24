<script setup lang="ts">
import type { StoreOrderData } from '~/components/store/OrderView.vue'

useSeoMeta({ title: 'Find an order · Kola Market', robots: 'noindex' })
const form = reactive({ displayId: '', email: '' })
const order = ref<StoreOrderData | null>(null)
const error = ref('')
const pending = ref(false)

async function lookup() {
  error.value = ''
  pending.value = true
  try {
    const res = await storeFetch<{ order: StoreOrderData }>('/api/store/orders/lookup', { method: 'POST', body: { displayId: form.displayId.replace('#', '').trim(), email: form.email } })
    order.value = res.order
  } catch {
    error.value = "We couldn't find an order with that number and email."
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="lookup">
    <h1 class="section-heading">Find an order</h1>
    <form class="lookup__form" @submit.prevent="lookup">
      <UiInput v-model="form.displayId" label="Order number" placeholder="#10482" mono required />
      <UiInput v-model="form.email" label="Email" type="email" autocomplete="email" required />
      <UiButton type="submit" variant="primary" :loading="pending">Find order</UiButton>
    </form>
    <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
    <StoreOrderView v-if="order" :order="order" />
  </div>
</template>

<style scoped>
.lookup {
  max-width: 820px;
  padding-top: 48px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.lookup__form {
  display: grid;
  grid-template-columns: 1fr 1.5fr auto;
  gap: 10px;
  align-items: end;
}
@media (max-width: 640px) {
  .lookup__form {
    grid-template-columns: 1fr;
  }
}
</style>
