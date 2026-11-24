<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Exchanges · Kola' })

interface Row {
  id: string
  status: string
  createdAt: string
  orderId: string
  displayId: number
  currencyCode: string
  email: string
  firstName: string | null
  lastName: string | null
  differenceDue: number
  [key: string]: unknown
}
const router = useRouter()
const list = useAdminList<Row>('/api/admin/exchanges', { filters: ['status'] })
const { data, pending, state, limit } = list
const columns: TableColumn[] = [{ key: 'order', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }, { key: 'createdAt', label: 'Created' }, { key: 'differenceDue', label: 'Difference', align: 'right' }]
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Orders', to: '/admin/orders' }, { label: 'Exchanges' }]" title="Exchanges" subtitle="Items swapped for replacements. The difference is settled when the return arrives." />
    <UiCard flush>
      
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending && !data.data.length" clickable caption="Exchanges" @row-click="router.push(`/admin/orders/${$event.orderId}`)">
        <template #cell-order="{ row }"><NuxtLink :to="`/admin/orders/${row.orderId}`" class="mono" @click.stop>#{{ row.displayId }}</NuxtLink></template>
        <template #cell-customer="{ row }">
          <div class="stack" style="--stack-gap: 0">
            <span>{{ [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Guest' }}</span>
            <span class="meta">{{ row.email }}</span>
          </div>
        </template>
        <template #cell-status="{ row }"><UiStatusBadge :status="row.status" /></template>
        <template #cell-createdAt="{ row }"><span class="meta">{{ fmt(row.createdAt) }}</span></template>
        <template #cell-differenceDue="{ row }"><UiMoney :amount="row.differenceDue" :currency="row.currencyCode" /></template>
        <template #empty>Nothing here yet.</template>
      </UiTable>
      <UiPagination :count="data.count" :limit="limit" :offset="state.offset" :shown="data.data.length" @change="list.setOffset" />
    </UiCard>
  </div>
</template>
