<script setup lang="ts">
import type { SelectOption } from '~/components/ui/Select.vue'

definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Tax regions · Settings' })

interface Rate {
  id: string
  name: string
  code: string
  rateBps: number
  isDefault: boolean
  productTypeId: string | null
}
interface Region {
  id: string
  name: string
  currencyCode: string
  taxInclusive: boolean
  automaticTaxes: boolean
  taxRates: Rate[]
}

const toast = useToast()
const { can } = useAdmin()
const { data, refresh } = await useFetch<{ data: Region[] }>('/api/admin/regions', { server: false, default: () => ({ data: [] }) })
const { data: types } = await useFetch<{ data: { id: string; value: string }[] }>('/api/admin/product-types', { server: false, default: () => ({ data: [] }) })
const typeName = (id: string | null) => (id ? types.value.data.find((t) => t.id === id)?.value ?? '—' : 'All products')
const pct = (bps: number) => `${(bps / 100).toLocaleString('en', { maximumFractionDigits: 2 })}%`

const open = ref(false)
const region = ref<Region | null>(null)
const editing = ref<Rate | null>(null)
const error = ref('')
const form = reactive({ name: '', code: '', rate: '', productTypeId: '', isDefault: true })
const typeOptions = computed<SelectOption[]>(() => [{ value: '', label: 'All products (default rate)' }, ...types.value.data.map((t) => ({ value: t.id, label: `Override for ${t.value}` }))])

function openForm(r: Region, rate?: Rate) {
  region.value = r
  editing.value = rate ?? null
  error.value = ''
  Object.assign(form, { name: rate?.name ?? 'VAT', code: rate?.code ?? 'VAT', rate: rate ? String(rate.rateBps / 100) : '', productTypeId: rate?.productTypeId ?? '', isDefault: rate?.isDefault ?? !r.taxRates.length })
  open.value = true
}
async function save() {
  error.value = ''
  const rateBps = Math.round(Number(form.rate) * 100)
  if (!Number.isFinite(rateBps) || rateBps < 0 || rateBps > 10_000) {
    error.value = 'Enter a rate between 0 and 100'
    return
  }
  const body = { name: form.name, code: form.code, rateBps, productTypeId: form.productTypeId || null, isDefault: !form.productTypeId && form.isDefault }
  try {
    await api(editing.value ? `/api/admin/tax-rates/${editing.value.id}` : `/api/admin/regions/${region.value!.id}/tax-rates`, { method: 'POST', body })
    toast.success('Tax rate saved')
    open.value = false
    await refresh()
  } catch (err) {
    error.value = apiErrorMessage(err)
  }
}
async function remove(rate: Rate) {
  try {
    await api(`/api/admin/tax-rates/${rate.id}`, { method: 'DELETE' })
    toast.success(`Deleted ${rate.name}`)
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader
      :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Tax regions' }]"
      title="Tax regions"
      subtitle="Each region has a default rate, plus optional overrides for product types. Tax-inclusive regions extract tax from displayed prices; exclusive regions add it at checkout."
      :search="false"
    />
    <UiCard v-for="r in data.data" :key="r.id" flush>
      <template #header>
        <div class="row" style="--row-gap: 10px">
          <h2 class="ui-card-title">{{ r.name }}</h2>
          <UiBadge mono>{{ r.currencyCode }}</UiBadge>
          <span class="meta">{{ r.taxInclusive ? 'Prices include tax' : 'Tax added at checkout' }}</span>
        </div>
      </template>
      <template #actions>
        <UiButton v-if="can('admin')" size="sm" variant="dashed" @click="openForm(r)">+ Add rate</UiButton>
      </template>
      <table v-if="r.taxRates.length" class="rates">
        <caption class="sr-only">Tax rates for {{ r.name }}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Code</th>
            <th scope="col">Applies to</th>
            <th scope="col" class="num">Rate</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rate in r.taxRates" :key="rate.id">
            <td>{{ rate.name }} <UiBadge v-if="rate.isDefault">Default</UiBadge></td>
            <td class="mono">{{ rate.code }}</td>
            <td class="ink-2">{{ typeName(rate.productTypeId) }}</td>
            <td class="num">{{ pct(rate.rateBps) }}</td>
            <td class="actions">
              <UiMenu
                v-if="can('admin')"
                :items="[{ label: 'Edit', value: 'edit' }, { label: 'Delete', value: 'delete', danger: true }]"
                :label="`Actions for ${rate.name}`"
                align="right"
                @select="$event === 'edit' ? openForm(r, rate) : remove(rate)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="meta empty">No tax rates. Orders in this region are untaxed.</p>
    </UiCard>

    <UiDialog v-model:open="open" :title="editing ? 'Edit tax rate' : `Add tax rate · ${region?.name}`">
      <form id="rate-form" class="stack" style="--stack-gap: 14px" @submit.prevent="save">
        <div class="form-grid">
          <UiInput v-model="form.name" label="Name" required />
          <UiInput v-model="form.code" label="Code" mono required />
          <UiInput v-model="form.rate" label="Rate (%)" inputmode="decimal" required placeholder="15" />
        </div>
        <UiSelect v-model="form.productTypeId" label="Applies to" :options="typeOptions" />
        <UiCheckbox v-if="!form.productTypeId" v-model="form.isDefault" label="Default rate for this region" />
        <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <UiButton @click="open = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="rate-form">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.ui-card-title {
  font-size: 14px;
  font-weight: 500;
}
.rates {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.rates th,
.rates td {
  padding: 9px 16px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
}
.rates th {
  font-size: var(--fs-meta);
  color: var(--ink-3);
  font-weight: 500;
}
.rates tbody tr:last-child td {
  border-bottom: 0;
}
.rates .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rates .actions {
  text-align: right;
  width: 56px;
}
.empty {
  padding: 14px 16px;
}
</style>
