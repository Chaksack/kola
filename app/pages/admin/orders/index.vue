<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import type { Kpi } from '~/components/ui/KpiStrip.vue'
import type { MenuItem } from '~/components/ui/Menu.vue'
import { formatMoney } from '#shared/utils/money'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Orders · Kola' })

interface OrderRow {
  id: string
  displayId: number
  createdAt: string
  email: string
  customerName: string | null
  salesChannel: string | null
  paymentStatus: string
  fulfillmentStatus: string
  total: number
  currencyCode: string
  [key: string]: unknown
}
interface Stats {
  currencyCode: string
  grossSales: { value: number; change: number | null }
  orders: { value: number; change: number | null }
  averageOrderValue: { value: number; change: number | null }
  awaitingFulfillment: { value: number; oldestAt: string | null }
}

const router = useRouter()
const list = useAdminList<OrderRow>('/api/admin/orders', { filters: ['tab', 'paymentStatus', 'fulfillmentStatus', 'salesChannelId', 'regionId'], defaultOrder: 'newest' })
const { data, pending, state, search, limit } = list
const tabs = computed(() => (data.value as unknown as { tabs?: Record<string, number> }).tabs ?? { all: 0, unfulfilled: 0, unpaid: 0, returns: 0 })
const tab = computed({ get: () => state.filters.tab ?? 'all', set: (v: string) => list.setFilter('tab', v === 'all' ? undefined : v) })

const { data: stats } = await useFetch<Stats>('/api/admin/stats/orders', { server: false })
const { data: channels } = await useFetch<{ data: { id: string; name: string }[] }>('/api/admin/sales-channels', { server: false, default: () => ({ data: [] }) })
const { data: regions } = await useFetch<{ data: { id: string; name: string }[] }>('/api/admin/regions', { server: false, default: () => ({ data: [] }) })

function delta(change: number | null, label = 'vs previous 30 days'): Pick<Kpi, 'delta' | 'tone'> {
  if (change === null) return { delta: 'No earlier data', tone: 'muted' }
  return { delta: `${change >= 0 ? '+' : ''}${change}% ${label}`, tone: change >= 0 ? 'ok' : 'warn' }
}
const kpis = computed<Kpi[]>(() => {
  const s = stats.value
  if (!s) return [{ label: 'Gross sales · 30 days', value: '—' }, { label: 'Orders · 30 days', value: '—' }, { label: 'Average order value', value: '—' }, { label: 'Awaiting fulfillment', value: '—' }]
  const days = s.awaitingFulfillment.oldestAt ? Math.floor((Date.now() - new Date(s.awaitingFulfillment.oldestAt).getTime()) / 86_400_000) : 0
  return [
    { label: `Gross sales · 30 days (${s.currencyCode})`, value: formatMoney(s.grossSales.value, s.currencyCode), ...delta(s.grossSales.change) },
    { label: 'Orders · 30 days', value: String(s.orders.value), ...delta(s.orders.change) },
    { label: 'Average order value', value: formatMoney(s.averageOrderValue.value, s.currencyCode), ...delta(s.averageOrderValue.change) },
    { label: 'Awaiting fulfillment', value: String(s.awaitingFulfillment.value), delta: s.awaitingFulfillment.value ? `Oldest ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}` : 'All caught up', tone: days > 2 ? 'warn' : 'ok' },
  ]
})

// "Add filter": pick a dimension, then a value pill appears
const FILTERS = {
  paymentStatus: { label: 'Payment', options: ['not_paid', 'awaiting', 'authorized', 'captured', 'partially_refunded', 'refunded', 'canceled'] },
  fulfillmentStatus: { label: 'Fulfillment', options: ['not_fulfilled', 'partially_fulfilled', 'fulfilled', 'partially_shipped', 'shipped', 'delivered', 'canceled'] },
  salesChannelId: { label: 'Sales channel', options: [] as string[] },
  regionId: { label: 'Region', options: [] as string[] },
} as const
type FilterKey = keyof typeof FILTERS
const shownFilters = ref<FilterKey[]>((Object.keys(FILTERS) as FilterKey[]).filter((k) => state.filters[k]))
const addFilterItems = computed<MenuItem[]>(() => (Object.keys(FILTERS) as FilterKey[]).filter((k) => !shownFilters.value.includes(k)).map((k) => ({ label: FILTERS[k].label, value: k })))
function filterOptions(k: FilterKey) {
  const head = { value: '', label: `${FILTERS[k].label}: Any` }
  if (k === 'salesChannelId') return [head, ...channels.value.data.map((c) => ({ value: c.id, label: c.name }))]
  if (k === 'regionId') return [head, ...regions.value.data.map((r) => ({ value: r.id, label: r.name }))]
  return [head, ...FILTERS[k].options.map((o) => ({ value: o, label: statusLabel(o) }))]
}
function removeFilter(k: FilterKey) {
  shownFilters.value = shownFilters.value.filter((x) => x !== k)
  list.setFilter(k, undefined)
}

const columns: TableColumn[] = [
  { key: 'displayId', label: 'Order' },
  { key: 'createdAt', label: 'Date' },
  { key: 'customer', label: 'Customer' },
  { key: 'salesChannel', label: 'Sales channel' },
  { key: 'paymentStatus', label: 'Payment' },
  { key: 'fulfillmentStatus', label: 'Fulfillment' },
  { key: 'total', label: 'Total', align: 'right' },
]
const fmtDate = (d: string) => {
  const date = new Date(d)
  const today = new Date()
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + `, ${time}`
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Commerce' }, { label: 'Orders' }]" title="Orders" subtitle="Payments, fulfillments, returns and exchanges across every sales channel.">
      <template #actions>
        <UiButton to="/admin/orders/export">Export</UiButton>
        <UiButton variant="primary" to="/admin/draft-orders">Create draft order</UiButton>
      </template>
    </AdminPageHeader>

    <UiKpiStrip :items="kpis" />

    <UiCard flush>
      <div class="table-toolbar">
        <UiTabs
          v-model="tab"
          label="Order filters"
          :items="[
            { value: 'all', label: 'All', count: tabs.all },
            { value: 'unfulfilled', label: 'Unfulfilled', count: tabs.unfulfilled },
            { value: 'unpaid', label: 'Unpaid', count: tabs.unpaid },
            { value: 'returns', label: 'Refunds & returns', count: tabs.returns },
          ]"
        />
        <span class="spacer" />
        <div class="table-toolbar__search">
          <UiInput v-model="search" type="search" label="Search orders" hide-label placeholder="Order #, email or name" />
        </div>
      </div>
      <div class="table-toolbar filters-row">
        <div v-for="k in shownFilters" :key="k" class="filter-pill">
          <UiSelect :model-value="state.filters[k] ?? ''" :options="filterOptions(k)" :label="FILTERS[k].label" hide-label pill @update:model-value="list.setFilter(k, $event)" />
          <UiButton variant="ghost" size="sm" icon :aria-label="`Remove ${FILTERS[k].label} filter`" @click="removeFilter(k)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </UiButton>
        </div>
        <UiMenu v-if="addFilterItems.length" :items="addFilterItems" label="Add filter" @select="shownFilters.push($event as FilterKey)">
          <template #trigger="{ open, toggle }">
            <button type="button" class="add-filter" aria-haspopup="menu" :aria-expanded="open" @click="toggle">+ Add filter</button>
          </template>
        </UiMenu>
        <span class="spacer" />
        <UiSelect
          :model-value="state.order ?? 'newest'"
          :options="[
            { value: 'newest', label: 'Sort: Newest' },
            { value: 'oldest', label: 'Sort: Oldest' },
            { value: 'total_desc', label: 'Sort: Highest total' },
            { value: 'total_asc', label: 'Sort: Lowest total' },
          ]"
          label="Sort"
          hide-label
          pill
          @update:model-value="list.setOrder($event)"
        />
      </div>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending && !data.data.length" clickable caption="Orders" @row-click="router.push(`/admin/orders/${$event.id}`)">
        <template #cell-displayId="{ row }">
          <NuxtLink :to="`/admin/orders/${row.id}`" class="mono" @click.stop>#{{ row.displayId }}</NuxtLink>
        </template>
        <template #cell-createdAt="{ row }"><span class="ink-2">{{ fmtDate(row.createdAt) }}</span></template>
        <template #cell-customer="{ row }">
          <div class="customer-cell">
            <span>{{ row.customerName ?? 'Guest' }}</span>
            <span class="meta">{{ row.email }}</span>
          </div>
        </template>
        <template #cell-salesChannel="{ row }"><span class="ink-2">{{ row.salesChannel ?? '—' }}</span></template>
        <template #cell-paymentStatus="{ row }"><UiStatusBadge :status="row.paymentStatus" /></template>
        <template #cell-fulfillmentStatus="{ row }"><UiStatusBadge :status="row.fulfillmentStatus" /></template>
        <template #cell-total="{ row }"><UiMoney :amount="row.total" :currency="row.currencyCode" /></template>
        <template #empty>{{ state.q || Object.values(state.filters).some(Boolean) ? 'No orders match these filters.' : 'No orders yet.' }}</template>
      </UiTable>
      <UiPagination :count="data.count" :limit="limit" :offset="state.offset" :shown="data.data.length" @change="list.setOffset" />
    </UiCard>
  </div>
</template>

<style scoped>
.filters-row {
  padding-top: 8px;
  padding-bottom: 8px;
}
.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.add-filter {
  background: none;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border: 1px dashed var(--outline);
  border-radius: var(--radius-pill);
  font-size: var(--fs-ui);
  color: var(--ink-2);
}
.customer-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
</style>
