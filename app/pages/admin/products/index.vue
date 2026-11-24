<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import type { SelectOption } from '~/components/ui/Select.vue'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Products · Kola' })

interface ProductRow {
  id: string
  title: string
  handle: string
  status: string
  thumbnail: string | null
  collectionTitle: string | null
  variantCount: number
  inventory: { status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked'; available: number; managedVariants: number }
  salesChannels: { id: string; name: string }[]
  [key: string]: unknown
}

const router = useRouter()
const list = useAdminList<ProductRow>('/api/admin/products', { filters: ['status', 'collectionId', 'salesChannelId'], defaultOrder: '-created_at' })
const { data, pending, state, search, limit } = list

const { data: collections } = await useFetch<{ data: { id: string; title: string }[] }>('/api/admin/collections', { server: false, default: () => ({ data: [] }) })
const { data: channels } = await useFetch<{ data: { id: string; name: string }[] }>('/api/admin/sales-channels', { server: false, default: () => ({ data: [] }) })

const statusOptions: SelectOption[] = [
  { value: '', label: 'Status: Any' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'rejected', label: 'Rejected' },
]
const collectionOptions = computed<SelectOption[]>(() => [{ value: '', label: 'Collection: Any' }, ...collections.value.data.map((c) => ({ value: c.id, label: c.title }))])
const channelOptions = computed<SelectOption[]>(() => [{ value: '', label: 'Sales channel: Any' }, ...channels.value.data.map((c) => ({ value: c.id, label: c.name }))])
const sortOptions: SelectOption[] = [
  { value: '-created_at', label: 'Sort: Newest' },
  { value: 'created_at', label: 'Sort: Oldest' },
  { value: 'title', label: 'Sort: Title A–Z' },
  { value: '-updated_at', label: 'Sort: Recently updated' },
]

const columns: TableColumn[] = [
  { key: 'product', label: 'Product' },
  { key: 'collection', label: 'Collection' },
  { key: 'channels', label: 'Sales channels' },
  { key: 'variantCount', label: 'Variants', align: 'right' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'status', label: 'Status' },
]

function inventoryText(r: ProductRow) {
  const inv = r.inventory
  if (inv.status === 'not_tracked') return 'Not tracked'
  if (inv.status === 'out_of_stock') return 'Out of stock'
  const across = inv.managedVariants > 1 ? ` across ${inv.managedVariants} variants` : ''
  return `${inv.available} in stock${across}`
}
const inventoryClass = (r: ProductRow) =>
  ({ in_stock: '', low_stock: 'text-warn', out_of_stock: 'text-danger', not_tracked: 'muted' })[r.inventory.status]
const channelText = (r: ProductRow) =>
  r.salesChannels.length === 0 ? 'None' : r.salesChannels.length <= 2 ? r.salesChannels.map((c) => c.name).join(', ') : `${r.salesChannels[0]!.name} +${r.salesChannels.length - 1}`
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Commerce' }, { label: 'Products' }]" title="Products" subtitle="Variants, options, pricing per region and stock across locations.">
      <template #actions>
        <UiButton to="/admin/products/import">Import CSV</UiButton>
        <UiButton variant="primary" to="/admin/products/new">Create product</UiButton>
      </template>
    </AdminPageHeader>

    <UiCard flush>
      <div class="table-toolbar">
        <div class="table-toolbar__search">
          <UiInput v-model="search" type="search" label="Search products" hide-label placeholder="Search title, SKU or handle" />
        </div>
        <UiSelect :model-value="state.filters.status ?? ''" :options="statusOptions" label="Status" hide-label pill @update:model-value="list.setFilter('status', $event)" />
        <UiSelect :model-value="state.filters.collectionId ?? ''" :options="collectionOptions" label="Collection" hide-label pill @update:model-value="list.setFilter('collectionId', $event)" />
        <UiSelect :model-value="state.filters.salesChannelId ?? ''" :options="channelOptions" label="Sales channel" hide-label pill @update:model-value="list.setFilter('salesChannelId', $event)" />
        <UiSelect :model-value="state.order ?? '-created_at'" :options="sortOptions" label="Sort" hide-label pill @update:model-value="list.setOrder($event)" />
        <span class="meta num table-toolbar__count">{{ data.count }} products</span>
      </div>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending && !data.data.length" clickable caption="Products" @row-click="router.push(`/admin/products/${$event.id}`)">
        <template #cell-product="{ row }">
          <div class="product-cell">
            <UiThumb :src="row.thumbnail" :alt="row.title" :seed="row.handle" :size="40" />
            <div class="product-cell__text">
              <NuxtLink :to="`/admin/products/${row.id}`" class="product-cell__title" @click.stop>{{ row.title }}</NuxtLink>
              <span class="mono meta">{{ row.handle }}</span>
            </div>
          </div>
        </template>
        <template #cell-collection="{ row }">
          <span :class="{ muted: !row.collectionTitle }">{{ row.collectionTitle ?? '—' }}</span>
        </template>
        <template #cell-channels="{ row }">
          <span :class="{ muted: !row.salesChannels.length }">{{ channelText(row) }}</span>
        </template>
        <template #cell-inventory="{ row }">
          <span :class="inventoryClass(row)">{{ inventoryText(row) }}</span>
        </template>
        <template #cell-status="{ row }"><UiStatusBadge :status="row.status" /></template>
        <template #empty>
          <span v-if="state.q || Object.values(state.filters).some(Boolean)">No products match these filters.</span>
          <span v-else>No products yet. <NuxtLink to="/admin/products/new">Create your first product</NuxtLink>.</span>
        </template>
      </UiTable>
      <UiPagination :count="data.count" :limit="limit" :offset="state.offset" :shown="data.data.length" @change="list.setOffset" />
    </UiCard>
  </div>
</template>

<style scoped>
.product-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}
.product-cell__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.product-cell__title {
  color: var(--ink);
}
</style>
