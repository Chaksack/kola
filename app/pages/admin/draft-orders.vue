<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import { formatMoney, fromMinor, toMinor } from '#shared/utils/money'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Draft orders · Kola' })

interface Draft {
  id: string
  displayId: number
  email: string
  firstName: string | null
  lastName: string | null
  total: number
  currencyCode: string
  createdAt: string
  items: { title: string; quantity: number }[]
  [key: string]: unknown
}
interface VariantHit {
  id: string
  title: string
  sku: string | null
  productTitle: string
}

const toast = useToast()
const { data, pending, refresh } = await useFetch<{ data: Draft[] }>('/api/admin/draft-orders', { server: false, default: () => ({ data: [] }) })
const { data: regions } = await useFetch<{ data: { id: string; name: string; currencyCode: string; countries: { iso2: string; name: string }[] }[] }>('/api/admin/regions', { server: false, default: () => ({ data: [] }) })

const columns: TableColumn[] = [
  { key: 'displayId', label: 'Draft' },
  { key: 'customer', label: 'Customer' },
  { key: 'items', label: 'Items' },
  { key: 'createdAt', label: 'Created' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]

// Create
const open = ref(false)
const saving = ref(false)
const error = ref('')
const form = reactive({
  email: '',
  regionId: '',
  shippingOptionId: '',
  firstName: '',
  lastName: '',
  address1: '',
  city: '',
  countryCode: 'gh',
  phone: '',
  note: '',
  lines: [] as (VariantHit & { quantity: number; price: string })[],
})
const region = computed(() => regions.value.data.find((r) => r.id === form.regionId))
const { data: shippingOptions } = await useFetch<{ data: { id: string; name: string; amount: number; currencyCode: string }[] }>('/api/admin/shipping-options', {
  server: false,
  query: computed(() => ({ regionId: form.regionId })),
  immediate: false,
  watch: [() => form.regionId],
  default: () => ({ data: [] }),
})
function openCreate() {
  Object.assign(form, { email: '', regionId: regions.value.data[0]?.id ?? '', shippingOptionId: '', firstName: '', lastName: '', address1: '', city: '', countryCode: 'gh', phone: '', note: '', lines: [] })
  error.value = ''
  open.value = true
}
const q = ref('')
const hits = ref<VariantHit[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  clearTimeout(timer)
  timer = setTimeout(async () => (hits.value = v.trim() ? (await api<{ data: VariantHit[] }>('/api/admin/variants', { query: { q: v } })).data : []), 200)
})
async function create() {
  saving.value = true
  error.value = ''
  try {
    const cur = region.value?.currencyCode ?? 'GHS'
    await $fetch('/api/admin/draft-orders', {
      method: 'POST',
      body: {
        email: form.email,
        regionId: form.regionId,
        shippingOptionId: form.shippingOptionId || null,
        shippingAddress: form.address1 ? { firstName: form.firstName, lastName: form.lastName, address1: form.address1, city: form.city, countryCode: form.countryCode, phone: form.phone } : null,
        note: form.note || null,
        items: form.lines.map((l) => ({ variantId: l.id, quantity: l.quantity, unitPrice: l.price ? toMinor(l.price, cur) : null })),
      },
    })
    toast.success('Draft order created')
    open.value = false
    await refresh()
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    saving.value = false
  }
}

async function onMenu(d: Draft, action: string) {
  try {
    if (action === 'delete') {
      await api(`/api/admin/draft-orders/${d.id}`, { method: 'DELETE' })
      toast.success('Draft deleted')
      return refresh()
    }
    const res = await api<{ order: { id: string } }>(`/api/admin/draft-orders/${d.id}/convert`, { method: 'POST', body: { paid: action === 'paid' } })
    toast.success(action === 'paid' ? 'Order placed and marked as paid' : 'Order placed, payment awaiting')
    await navigateTo(`/admin/orders/${res.order.id}`)
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Orders', to: '/admin/orders' }, { label: 'Drafts' }]" title="Draft orders" subtitle="Orders you build for a customer, for phone, showroom and wholesale sales. Stock is reserved when a draft is placed.">
      <template #actions>
        <UiButton variant="primary" @click="openCreate">Create draft order</UiButton>
      </template>
    </AdminPageHeader>
    <UiCard flush>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending" caption="Draft orders">
        <template #cell-displayId="{ row }"><span class="mono">D-{{ row.displayId }}</span></template>
        <template #cell-customer="{ row }">
          <div class="stack" style="--stack-gap: 0">
            <span>{{ [row.firstName, row.lastName].filter(Boolean).join(' ') || '—' }}</span>
            <span class="meta">{{ row.email }}</span>
          </div>
        </template>
        <template #cell-items="{ row }"><span class="ink-2">{{ row.items.map((i) => `${i.quantity} × ${i.title}`).join(', ') }}</span></template>
        <template #cell-createdAt="{ row }"><span class="meta">{{ fmt(row.createdAt) }}</span></template>
        <template #cell-total="{ row }"><UiMoney :amount="row.total" :currency="row.currencyCode" /></template>
        <template #cell-actions="{ row }">
          <UiMenu
            :items="[{ label: 'Place order · mark as paid', value: 'paid' }, { label: 'Place order · payment pending', value: 'pending' }, { label: 'Delete draft', value: 'delete', danger: true }]"
            :label="`Actions for draft ${row.displayId}`"
            align="right"
            @select="onMenu(row, $event)"
          />
        </template>
        <template #empty>No drafts. Create one for a phone or showroom sale.</template>
      </UiTable>
    </UiCard>

    <UiDialog v-model:open="open" title="Create draft order" width="640px">
      <form id="draft-form" class="stack" style="--stack-gap: 14px" @submit.prevent="create">
        <div class="form-grid">
          <UiInput v-model="form.email" label="Customer email" type="email" required />
          <UiSelect v-model="form.regionId" label="Region" :options="regions.data.map((r) => ({ value: r.id, label: `${r.name} · ${r.currencyCode}` }))" />
        </div>
        <fieldset class="lines">
          <legend class="field-label">Items</legend>
          <div v-for="(l, idx) in form.lines" :key="l.id" class="line">
            <span>{{ l.productTitle }} <span class="meta">{{ l.title }}</span></span>
            <input v-model.number="l.quantity" type="number" min="1" class="qty" :aria-label="`Quantity of ${l.productTitle}`">
            <input v-model="l.price" class="qty price" inputmode="decimal" :placeholder="`List price`" :aria-label="`Custom price for ${l.productTitle}`">
            <UiButton size="sm" variant="ghost" @click="form.lines.splice(idx, 1)">Remove</UiButton>
          </div>
          <UiInput v-model="q" type="search" label="Add item" hide-label placeholder="Search products or SKU" />
          <ul v-if="hits.length" class="hits">
            <li v-for="h in hits" :key="h.id">
              <button type="button" @click="form.lines.push({ ...h, quantity: 1, price: '' }); q = ''">{{ h.productTitle }} · {{ h.title }} <span class="mono meta">{{ h.sku }}</span></button>
            </li>
          </ul>
        </fieldset>
        <UiSelect
          v-model="form.shippingOptionId"
          label="Shipping"
          :options="[{ value: '', label: 'No shipping (collect in store)' }, ...shippingOptions.data.map((o) => ({ value: o.id, label: `${o.name} · ${o.amount ? formatMoney(o.amount, o.currencyCode) : 'Free'}` }))]"
        />
        <details>
          <summary class="field-label">Shipping address</summary>
          <div class="form-grid" style="margin-top: 10px">
            <UiInput v-model="form.firstName" label="First name" />
            <UiInput v-model="form.lastName" label="Last name" />
            <UiInput v-model="form.address1" label="Address" />
            <UiInput v-model="form.city" label="City" />
            <UiSelect v-model="form.countryCode" label="Country" :options="(region?.countries ?? []).map((c) => ({ value: c.iso2, label: c.name }))" />
            <UiInput v-model="form.phone" label="Phone" type="tel" />
          </div>
        </details>
        <UiInput v-model="form.note" label="Note" />
        <p class="meta">Leave the price empty to use the list price in {{ region?.currencyCode }}. Example: {{ fromMinor(12000, region?.currencyCode ?? 'GHS') }}.</p>
        <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <UiButton @click="open = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="draft-form" :loading="saving" :disabled="!form.lines.length">Create draft</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.lines {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.line {
  display: grid;
  grid-template-columns: 1fr 70px 110px auto;
  gap: 8px;
  align-items: center;
  font-size: var(--fs-ui);
}
.qty {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
  text-align: right;
  width: 100%;
}
.hits {
  list-style: none;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  max-height: 180px;
  overflow-y: auto;
}
.hits button {
  width: 100%;
  padding: 8px;
  border: 0;
  background: none;
  text-align: left;
  font: inherit;
  font-size: var(--fs-ui);
  border-radius: var(--radius);
  cursor: pointer;
}
.hits button:hover {
  background: var(--putty-inset);
}
summary {
  cursor: pointer;
}
</style>
