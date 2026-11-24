<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Price lists · Kola' })

interface ListRow {
  id: string
  title: string
  description: string | null
  type: 'sale' | 'override'
  effectiveStatus: string
  startsAt: string | null
  endsAt: string | null
  variantCount: number
  customerGroups: { id: string; name: string }[]
  [key: string]: unknown
}

const router = useRouter()
const toast = useToast()
const { data, pending } = await useFetch<{ data: ListRow[] }>('/api/admin/price-lists', { server: false, default: () => ({ data: [] }) })
const columns: TableColumn[] = [
  { key: 'title', label: 'Price list' },
  { key: 'type', label: 'Type' },
  { key: 'groups', label: 'Customer groups' },
  { key: 'variantCount', label: 'Variants', align: 'right' },
  { key: 'dates', label: 'Runs' },
  { key: 'status', label: 'Status' },
]
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null)

const open = ref(false)
const form = reactive({ title: '', type: 'sale' })
async function create() {
  try {
    const res = await $fetch<{ priceList: { id: string } }>('/api/admin/price-lists', { method: 'POST', body: { title: form.title, type: form.type } })
    await navigateTo(`/admin/price-lists/${res.priceList.id}`)
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Commerce' }, { label: 'Price lists' }]" title="Price lists" subtitle="Sales and customer-specific pricing. A sale list applies when it's cheaper than the base price; an override list replaces it, optionally only for certain customer groups.">
      <template #actions>
        <UiButton variant="primary" @click="open = true">Create price list</UiButton>
      </template>
    </AdminPageHeader>
    <UiCard flush>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending" clickable caption="Price lists" @row-click="router.push(`/admin/price-lists/${$event.id}`)">
        <template #cell-title="{ row }">
          <div class="stack" style="--stack-gap: 0">
            <NuxtLink :to="`/admin/price-lists/${row.id}`" style="color: var(--ink)" @click.stop>{{ row.title }}</NuxtLink>
            <span v-if="row.description" class="meta">{{ row.description }}</span>
          </div>
        </template>
        <template #cell-type="{ row }"><UiBadge>{{ row.type === 'sale' ? 'Sale' : 'Override' }}</UiBadge></template>
        <template #cell-groups="{ row }"><span class="ink-2">{{ row.customerGroups.map((g) => g.name).join(', ') || 'Everyone' }}</span></template>
        <template #cell-dates="{ row }"><span class="meta">{{ row.startsAt || row.endsAt ? `${fmt(row.startsAt) ?? 'Now'} – ${fmt(row.endsAt) ?? 'no end'}` : 'Always' }}</span></template>
        <template #cell-status="{ row }"><UiStatusBadge :status="row.effectiveStatus" /></template>
        <template #empty>No price lists yet.</template>
      </UiTable>
    </UiCard>
    <UiDialog v-model:open="open" title="Create price list">
      <form id="pl-form" class="stack" style="--stack-gap: 12px" @submit.prevent="create">
        <UiInput v-model="form.title" label="Title" required placeholder="Black Friday" />
        <UiSelect v-model="form.type" label="Type" :options="[{ value: 'sale', label: 'Sale · applies when cheaper' }, { value: 'override', label: 'Override · replaces the price' }]" />
      </form>
      <template #footer>
        <UiButton @click="open = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="pl-form">Create</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
