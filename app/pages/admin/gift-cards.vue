<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import { formatMoney, toMinor } from '#shared/utils/money'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Gift cards · Kola' })

interface Card {
  id: string
  codeLast4: string
  value: number
  balance: number
  currencyCode: string
  isDisabled: boolean
  endsAt: string | null
  createdAt: string
  [key: string]: unknown
}
const toast = useToast()
const copy = useClipboard()
const { can } = useAdmin()
const list = useAdminList<Card>('/api/admin/gift-cards')
const { data, pending, state, search, limit, refresh } = list
const { data: storeData } = await useFetch<{ store: { defaultCurrencyCode: string; currencies: { code: string }[] } }>('/api/admin/store', { server: false })

const columns: TableColumn[] = [
  { key: 'code', label: 'Code' },
  { key: 'balance', label: 'Balance', align: 'right' },
  { key: 'value', label: 'Value', align: 'right' },
  { key: 'status', label: 'Status' },
  { key: 'endsAt', label: 'Expires' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]
const status = (c: Card) => (c.isDisabled ? 'disabled' : c.endsAt && new Date(c.endsAt) < new Date() ? 'expired' : c.balance === 0 ? 'completed' : 'active')

const open = ref(false)
const form = reactive({ value: '', currencyCode: 'GHS', endsAt: '' })
const createdCode = ref('')
function openCreate() {
  Object.assign(form, { value: '', currencyCode: storeData.value?.store.defaultCurrencyCode ?? 'GHS', endsAt: '' })
  createdCode.value = ''
  open.value = true
}
async function create() {
  try {
    const res = await $fetch<{ giftCard: { code: string } }>('/api/admin/gift-cards', { method: 'POST', body: { value: toMinor(form.value, form.currencyCode), currencyCode: form.currencyCode, endsAt: form.endsAt || null } })
    createdCode.value = res.giftCard.code
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Enter a valid amount'))
  }
}
async function toggle(c: Card) {
  try {
    await api(`/api/admin/gift-cards/${c.id}`, { method: 'POST', body: { isDisabled: !c.isDisabled } })
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Products', to: '/admin/products' }, { label: 'Gift cards' }]" title="Gift cards" subtitle="Issued and purchased gift cards with their remaining balance. Codes are shown in full only when created.">
      <template #actions>
        <UiButton v-if="can('admin')" variant="primary" @click="openCreate">Issue gift card</UiButton>
      </template>
    </AdminPageHeader>
    <UiCard flush>
      <div class="table-toolbar">
        <div class="table-toolbar__search"><UiInput v-model="search" type="search" label="Search codes" hide-label placeholder="Search by code" /></div>
      </div>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending && !data.data.length" caption="Gift cards">
        <template #cell-code="{ row }"><span class="mono">••••{{ row.codeLast4 }}</span></template>
        <template #cell-balance="{ row }"><UiMoney :amount="row.balance" :currency="row.currencyCode" /></template>
        <template #cell-value="{ row }"><span class="ink-2"><UiMoney :amount="row.value" :currency="row.currencyCode" /></span></template>
        <template #cell-status="{ row }"><UiStatusBadge :status="status(row)" :label="status(row) === 'completed' ? 'Used' : undefined" /></template>
        <template #cell-endsAt="{ row }"><span class="meta">{{ row.endsAt ? new Date(row.endsAt).toLocaleDateString('en-GB') : 'Never' }}</span></template>
        <template #cell-actions="{ row }">
          <UiMenu v-if="can('admin')" :items="[{ label: row.isDisabled ? 'Enable' : 'Disable', value: 'toggle', danger: !row.isDisabled }]" :label="`Actions for card ending ${row.codeLast4}`" align="right" @select="toggle(row)" />
        </template>
        <template #empty>No gift cards yet.</template>
      </UiTable>
      <UiPagination :count="data.count" :limit="limit" :offset="state.offset" :shown="data.data.length" @change="list.setOffset" />
    </UiCard>
    <UiDialog v-model:open="open" title="Issue gift card">
      <form v-if="!createdCode" id="gc-form" class="stack" style="--stack-gap: 12px" @submit.prevent="create">
        <div class="form-grid">
          <UiInput v-model="form.value" label="Value" inputmode="decimal" required />
          <UiSelect v-model="form.currencyCode" label="Currency" :options="(storeData?.store.currencies ?? []).map((c) => ({ value: c.code, label: c.code }))" />
        </div>
        <UiInput v-model="form.endsAt" label="Expires" type="date" hint="Leave empty for no expiry" />
      </form>
      <div v-else class="stack" style="--stack-gap: 10px">
        <p>Share this code with the recipient. It won't be shown in full again.</p>
        <UiInput :model-value="createdCode" label="Gift card code" mono readonly />
        <p class="meta">Value {{ formatMoney(toMinor(form.value || '0', form.currencyCode), form.currencyCode) }}</p>
      </div>
      <template #footer>
        <template v-if="!createdCode">
          <UiButton @click="open = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="gc-form">Issue</UiButton>
        </template>
        <template v-else>
          <UiButton @click="copy(createdCode, 'Code copied')">Copy code</UiButton>
          <UiButton variant="primary" @click="open = false">Done</UiButton>
        </template>
      </template>
    </UiDialog>
  </div>
</template>
