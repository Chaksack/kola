<script setup lang="ts">
import type { EditablePromotion } from '~/components/admin/PromotionEditor.vue'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
const route = useRoute()
const { data, error, refresh } = await useFetch<{ promotion: EditablePromotion }>(() => `/api/admin/promotions/${route.params.id}`, { server: false })
useSeoMeta({ title: () => `${data.value?.promotion.code ?? 'Promotion'} · Kola` })
const key = ref(0)
async function onSaved() {
  await refresh()
  key.value++
}
</script>

<template>
  <div class="page-stack">
    <UiEmptyState v-if="error" title="Promotion not found" />
    <AdminPromotionEditor v-else-if="data" :key="key" :promotion="data.promotion" @saved="onSaved" />
    <p v-else class="meta">Loading…</p>
  </div>
</template>
