<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import { describePromotion } from '#shared/utils/promotions'
import { formatMoney, fromMinor, toMinor } from '#shared/utils/money'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Promotions · Kola' })

interface PromoRow {
  id: string
  code: string
  type: 'standard' | 'buyget'
  isAutomatic: boolean
  status: string
  applicationType: 'percentage' | 'fixed'
  value: number
  currencyCode: string | null
  targetType: 'items' | 'shipping' | 'order'
  allocation: 'each' | 'across'
  buyQuantity: number | null
  applyToQuantity: number | null
  usageCount: number
  usageLimit: number | null
  startsAt: string | null
  endsAt: string | null
  campaignName: string | null
  [key: string]: unknown
}
interface Campaign {
  id: string
  name: string
  identifier: string
  description: string | null
  startsAt: string | null
  endsAt: string | null
  budgetType: 'spend' | 'usage' | null
  budgetLimit: number | null
  budgetUsed: number
  budgetCurrencyCode: string | null
  promotionCount: number
  [key: string]: unknown
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const view = computed({ get: () => (route.query.view === 'campaigns' ? 'campaigns' : 'promotions'), set: (v: string) => router.replace({ query: v === 'campaigns' ? { view: 'campaigns' } : {} }) })
const list = useAdminList<PromoRow>('/api/admin/promotions', { filters: ['status'] })
const { data, pending, state, search, limit } = list
const { data: campaigns, refresh: refreshCampaigns } = await useFetch<{ data: Campaign[] }>('/api/admin/campaigns', { server: false, default: () => ({ data: [] }) })

const columns: TableColumn[] = [
  { key: 'code', label: 'Code' },
  { key: 'method', label: 'Discount' },
  { key: 'status', label: 'Status' },
  { key: 'usage', label: 'Used', align: 'right' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'dates', label: 'Runs' },
]
const campaignColumns: TableColumn[] = [
  { key: 'name', label: 'Campaign' },
  { key: 'promotionCount', label: 'Promotions', align: 'right' },
  { key: 'budget', label: 'Budget' },
  { key: 'dates', label: 'Runs' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null)
const runs = (r: { startsAt: string | null; endsAt: string | null }) => (r.startsAt || r.endsAt ? `${fmt(r.startsAt) ?? 'Now'} – ${fmt(r.endsAt) ?? 'no end'}` : 'Always')
function promoStatus(r: PromoRow) {
  const now = Date.now()
  if (r.status === 'active' && r.endsAt && new Date(r.endsAt).getTime() < now) return 'expired'
  if (r.status === 'active' && r.startsAt && new Date(r.startsAt).getTime() > now) return 'scheduled'
  return r.status
}
const budgetText = (c: Campaign) =>
  !c.budgetType ? 'No budget' : c.budgetType === 'usage' ? `${c.budgetUsed} / ${c.budgetLimit} uses` : `${formatMoney(c.budgetUsed, c.budgetCurrencyCode ?? 'GHS')} / ${formatMoney(c.budgetLimit ?? 0, c.budgetCurrencyCode ?? 'GHS')}`

// Campaign dialog
const campOpen = ref(false)
const campEditing = ref<Campaign | null>(null)
const camp = reactive({ name: '', identifier: '', description: '', startsAt: '', endsAt: '', budgetType: '', budgetLimit: '', budgetCurrencyCode: 'GHS' })
function openCampaign(c?: Campaign) {
  campEditing.value = c ?? null
  Object.assign(camp, {
    name: c?.name ?? '',
    identifier: c?.identifier ?? '',
    description: c?.description ?? '',
    startsAt: c?.startsAt?.slice(0, 10) ?? '',
    endsAt: c?.endsAt?.slice(0, 10) ?? '',
    budgetType: c?.budgetType ?? '',
    budgetLimit: c?.budgetLimit ? (c.budgetType === 'spend' ? fromMinor(c.budgetLimit, c.budgetCurrencyCode ?? 'GHS') : String(c.budgetLimit)) : '',
    budgetCurrencyCode: c?.budgetCurrencyCode ?? 'GHS',
  })
  campOpen.value = true
}
async function saveCampaign() {
  const limitValue = camp.budgetLimit ? (camp.budgetType === 'spend' ? toMinor(camp.budgetLimit, camp.budgetCurrencyCode) : Number(camp.budgetLimit)) : null
  const body = {
    name: camp.name,
    identifier: camp.identifier || camp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: camp.description || null,
    startsAt: camp.startsAt || null,
    endsAt: camp.endsAt || null,
    budgetType: camp.budgetType || null,
    budgetLimit: camp.budgetType ? limitValue : null,
    budgetCurrencyCode: camp.budgetType === 'spend' ? camp.budgetCurrencyCode : null,
  }
  try {
    await api(campEditing.value ? `/api/admin/campaigns/${campEditing.value.id}` : '/api/admin/campaigns', { method: 'POST', body })
    campOpen.value = false
    await refreshCampaigns()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
async function onCampaignMenu(c: Campaign, action: string) {
  if (action === 'edit') return openCampaign(c)
  try {
    await api(`/api/admin/campaigns/${c.id}`, { method: 'DELETE' })
    await refreshCampaigns()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Commerce' }, { label: 'Promotions' }]" title="Promotions" subtitle="Discount codes and automatic offers, with rules for products, customer groups and regions. Campaigns group promotions under a shared budget.">
      <template #actions>
        <UiButton v-if="view === 'campaigns'" variant="primary" @click="openCampaign()">Create campaign</UiButton>
        <UiButton v-else variant="primary" to="/admin/promotions/new">Create promotion</UiButton>
      </template>
    </AdminPageHeader>
    <UiTabs v-model="view" label="Promotion views" :items="[{ value: 'promotions', label: 'Promotions', count: data.count }, { value: 'campaigns', label: 'Campaigns', count: campaigns.data.length }]" />

    <UiCard v-if="view === 'promotions'" flush>
      <div class="table-toolbar">
        <div class="table-toolbar__search"><UiInput v-model="search" type="search" label="Search codes" hide-label placeholder="Search codes" /></div>
        <UiSelect
          :model-value="state.filters.status ?? ''"
          :options="[{ value: '', label: 'Status: Any' }, { value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'inactive', label: 'Inactive' }]"
          label="Status"
          hide-label
          pill
          @update:model-value="list.setFilter('status', $event)"
        />
      </div>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending && !data.data.length" clickable caption="Promotions" @row-click="router.push(`/admin/promotions/${$event.id}`)">
        <template #cell-code="{ row }">
          <NuxtLink :to="`/admin/promotions/${row.id}`" class="mono" @click.stop>{{ row.code }}</NuxtLink>
          <UiBadge v-if="row.isAutomatic" style="margin-left: 6px">Automatic</UiBadge>
        </template>
        <template #cell-method="{ row }"><span class="ink-2">{{ describePromotion(row) }}</span></template>
        <template #cell-status="{ row }"><UiStatusBadge :status="promoStatus(row)" /></template>
        <template #cell-usage="{ row }"><span class="num">{{ row.usageCount }}<span v-if="row.usageLimit" class="muted"> / {{ row.usageLimit }}</span></span></template>
        <template #cell-campaign="{ row }"><span class="ink-2">{{ row.campaignName ?? '—' }}</span></template>
        <template #cell-dates="{ row }"><span class="meta">{{ runs(row) }}</span></template>
      </UiTable>
      <UiPagination :count="data.count" :limit="limit" :offset="state.offset" :shown="data.data.length" @change="list.setOffset" />
    </UiCard>

    <UiCard v-else flush>
      <UiTable :columns="campaignColumns" :rows="campaigns.data" row-key="id" caption="Campaigns">
        <template #cell-name="{ row }">
          <div class="stack" style="--stack-gap: 0">
            <span>{{ row.name }}</span>
            <span class="mono meta">{{ row.identifier }}</span>
          </div>
        </template>
        <template #cell-budget="{ row }"><span class="num ink-2">{{ budgetText(row) }}</span></template>
        <template #cell-dates="{ row }"><span class="meta">{{ runs(row) }}</span></template>
        <template #cell-actions="{ row }">
          <UiMenu :items="[{ label: 'Edit', value: 'edit' }, { label: 'Delete', value: 'delete', danger: true }]" :label="`Actions for ${row.name}`" align="right" @select="onCampaignMenu(row, $event)" />
        </template>
        <template #empty>No campaigns yet.</template>
      </UiTable>
    </UiCard>

    <UiDialog v-model:open="campOpen" :title="campEditing ? 'Edit campaign' : 'Create campaign'">
      <form id="camp-form" class="stack" style="--stack-gap: 12px" @submit.prevent="saveCampaign">
        <div class="form-grid">
          <UiInput v-model="camp.name" label="Name" required />
          <UiInput v-model="camp.identifier" label="Identifier" mono placeholder="harmattan-2026" />
        </div>
        <UiInput v-model="camp.description" label="Description" />
        <div class="form-grid">
          <UiInput v-model="camp.startsAt" label="Starts" type="date" />
          <UiInput v-model="camp.endsAt" label="Ends" type="date" />
        </div>
        <div class="form-grid">
          <UiSelect v-model="camp.budgetType" label="Budget" :options="[{ value: '', label: 'No budget' }, { value: 'usage', label: 'Number of uses' }, { value: 'spend', label: 'Total discount' }]" />
          <UiInput v-if="camp.budgetType" v-model="camp.budgetLimit" :label="camp.budgetType === 'spend' ? `Limit (${camp.budgetCurrencyCode})` : 'Max uses'" inputmode="decimal" />
        </div>
      </form>
      <template #footer>
        <UiButton @click="campOpen = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="camp-form">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
