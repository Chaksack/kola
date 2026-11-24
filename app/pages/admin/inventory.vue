<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import type { SelectOption } from '~/components/ui/Select.vue'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Inventory · Kola' })

interface Level {
  locationId: string
  stocked: number
  reserved: number
  incoming: number
  available: number
}
interface ItemRow {
  id: string
  sku: string | null
  lowStockThreshold: number
  variantTitle: string
  productId: string
  productTitle: string
  productHandle: string
  thumbnail: string | null
  stocked: number
  reserved: number
  incoming: number
  available: number
  status: 'in_stock' | 'low_stock' | 'out_of_stock'
  levels: Level[]
  [key: string]: unknown
}

const toast = useToast()
const list = useAdminList<ItemRow>('/api/admin/inventory', { filters: ['locationId', 'status'], limit: 50 })
const { data, pending, state, search, limit, refresh } = list
const { data: locations } = await useFetch<{ data: { id: string; name: string }[] }>('/api/admin/stock-locations', { server: false, default: () => ({ data: [] }) })

const locationOptions = computed<SelectOption[]>(() => [{ value: '', label: 'All locations' }, ...locations.value.data.map((l) => ({ value: l.id, label: l.name }))])
const statusOptions: SelectOption[] = [
  { value: '', label: 'Stock: Any' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
]
const columns: TableColumn[] = [
  { key: 'item', label: 'Item' },
  { key: 'sku', label: 'SKU', mono: true },
  { key: 'stocked', label: 'Stocked', align: 'right' },
  { key: 'reserved', label: 'Reserved', align: 'right' },
  { key: 'available', label: 'Available', align: 'right' },
  { key: 'incoming', label: 'Incoming', align: 'right' },
]
const availableClass = (r: ItemRow) => ({ in_stock: '', low_stock: 'text-warn', out_of_stock: 'text-danger' })[r.status]

// Adjust drawer
const selected = ref<ItemRow | null>(null)
const drawerOpen = computed({ get: () => Boolean(selected.value), set: (v) => !v && (selected.value = null) })
const draft = reactive<{ threshold: number; levels: Record<string, { stocked: number; incoming: number; reserved: number }> }>({ threshold: 5, levels: {} })
const saving = ref(false)
const saveError = ref('')

function open(row: ItemRow) {
  selected.value = row
  saveError.value = ''
  draft.threshold = row.lowStockThreshold
  draft.levels = Object.fromEntries(
    locations.value.data.map((l) => {
      const lv = row.levels.find((x) => x.locationId === l.id)
      return [l.id, { stocked: lv?.stocked ?? 0, incoming: lv?.incoming ?? 0, reserved: lv?.reserved ?? 0 }]
    }),
  )
}
async function save() {
  const row = selected.value
  if (!row) return
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/admin/inventory/${row.id}`, {
      method: 'POST',
      body: {
        lowStockThreshold: Number(draft.threshold),
        levels: Object.entries(draft.levels).map(([locationId, l]) => ({ locationId, stocked: Math.max(0, Math.floor(Number(l.stocked) || 0)), incoming: Math.max(0, Math.floor(Number(l.incoming) || 0)) })),
      },
    })
    toast.success(`Updated ${row.productTitle} · ${row.variantTitle}`)
    selected.value = null
    await refresh()
  } catch (err) {
    saveError.value = apiErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Commerce' }, { label: 'Inventory' }]" title="Inventory" subtitle="Stocked, reserved and incoming quantities for every tracked variant across your locations." />

    <UiCard flush>
      <div class="table-toolbar">
        <div class="table-toolbar__search">
          <UiInput v-model="search" type="search" label="Search inventory" hide-label placeholder="Search product, variant or SKU" />
        </div>
        <UiSelect :model-value="state.filters.locationId ?? ''" :options="locationOptions" label="Location" hide-label pill @update:model-value="list.setFilter('locationId', $event)" />
        <UiSelect :model-value="state.filters.status ?? ''" :options="statusOptions" label="Stock status" hide-label pill @update:model-value="list.setFilter('status', $event)" />
        <span class="meta num table-toolbar__count">{{ data.count }} items</span>
      </div>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending && !data.data.length" clickable caption="Inventory items" @row-click="open">
        <template #cell-item="{ row }">
          <div class="row" style="--row-gap: 12px; flex-wrap: nowrap">
            <UiThumb :src="row.thumbnail" :alt="row.productTitle" :seed="row.productHandle" :size="36" />
            <div>
              <button type="button" class="item-link" @click.stop="open(row)">{{ row.productTitle }}</button>
              <div class="meta">{{ row.variantTitle }}</div>
            </div>
          </div>
        </template>
        <template #cell-sku="{ row }">{{ row.sku ?? '—' }}</template>
        <template #cell-available="{ row }">
          <span :class="availableClass(row)">{{ row.available }}</span>
        </template>
        <template #cell-incoming="{ row }">
          <span :class="{ muted: !row.incoming }">{{ row.incoming }}</span>
        </template>
        <template #empty>No tracked inventory matches.</template>
      </UiTable>
      <UiPagination :count="data.count" :limit="limit" :offset="state.offset" :shown="data.data.length" @change="list.setOffset" />
    </UiCard>

    <UiDrawer v-model:open="drawerOpen" :title="selected ? `${selected.productTitle} · ${selected.variantTitle}` : 'Adjust stock'">
      <div v-if="selected" class="stack" style="--stack-gap: 16px">
        <p class="mono meta">{{ selected.sku ?? 'No SKU' }}</p>
        <table class="levels">
          <caption class="sr-only">Stock per location</caption>
          <thead>
            <tr>
              <th scope="col">Location</th>
              <th scope="col" class="num">Stocked</th>
              <th scope="col" class="num">Reserved</th>
              <th scope="col" class="num">Incoming</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in locations.data" :key="l.id">
              <th scope="row">{{ l.name }}</th>
              <td><input v-model.number="draft.levels[l.id]!.stocked" type="number" min="0" class="cell-input" :aria-label="`Stocked at ${l.name}`"></td>
              <td class="num muted">{{ draft.levels[l.id]?.reserved }}</td>
              <td><input v-model.number="draft.levels[l.id]!.incoming" type="number" min="0" class="cell-input" :aria-label="`Incoming at ${l.name}`"></td>
            </tr>
          </tbody>
        </table>
        <UiInput v-model="draft.threshold" type="number" min="0" label="Low stock threshold" hint="Available at or below this shows as low stock" />
        <p v-if="saveError" class="text-danger" role="alert">{{ saveError }}</p>
        <NuxtLink :to="`/admin/products/${selected.productId}`" class="meta">Open product</NuxtLink>
      </div>
      <template #footer>
        <UiButton @click="selected = null">Cancel</UiButton>
        <UiButton variant="primary" :loading="saving" @click="save">Save</UiButton>
      </template>
    </UiDrawer>
  </div>
</template>

<style scoped>
.item-link {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}
.item-link:hover {
  text-decoration: underline;
}
.levels {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.levels th,
.levels td {
  padding: 8px 6px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
}
.levels thead th {
  font-size: var(--fs-meta);
  color: var(--ink-3);
  font-weight: 500;
}
.levels tbody th {
  font-weight: 400;
}
.levels .num {
  text-align: right;
}
.cell-input {
  width: 80px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
  text-align: right;
  font-size: var(--fs-ui);
  font-variant-numeric: tabular-nums;
}
</style>
