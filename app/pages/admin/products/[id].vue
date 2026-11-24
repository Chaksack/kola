<script setup lang="ts">
import type { EditableProduct } from '~/components/admin/ProductEditor.vue'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh } = await useFetch<{ product: EditableProduct }>(() => `/api/admin/products/${id.value}`, { server: false })
const editorKey = ref(0)
useSeoMeta({ title: () => `${data.value?.product.title ?? 'Product'} · Kola` })

async function onSaved() {
  await refresh()
  editorKey.value++
}
</script>

<template>
  <div class="page-stack">
    <template v-if="error">
      <AdminPageHeader :back="{ label: 'Products', to: '/admin/products' }" title="Product not found" :search="false" />
      <UiEmptyState title="This product doesn't exist" description="It may have been deleted." />
    </template>
    <AdminProductEditor v-else-if="data" :key="`${id}-${editorKey}`" :product="data.product" @saved="onSaved" @deleted="navigateTo('/admin/products')" />
    <p v-else class="meta">Loading…</p>
  </div>
</template>
