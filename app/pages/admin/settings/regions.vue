<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import type { SelectOption } from '~/components/ui/Select.vue'

definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Regions · Settings' })

interface Region {
  id: string
  name: string
  currencyCode: string
  taxInclusive: boolean
  automaticTaxes: boolean
  countries: { iso2: string; name: string }[]
  paymentProviders: string[]
  taxRates: { id: string; name: string; rateBps: number; isDefault: boolean; productTypeId: string | null }[]
  [key: string]: unknown
}
interface Country {
  iso2: string
  name: string
  regionId: string | null
  regionName: string | null
}

const toast = useToast()
const copy = useClipboard()
const { can } = useAdmin()
const opts = { server: false } as const
const [{ data: regions, refresh, pending }, { data: countries, refresh: refreshCountries }, { data: providers }, { data: storeData }, { data: channels }, { data: keys }, { data: currencyList }] = await Promise.all([
  useFetch<{ data: Region[] }>('/api/admin/regions', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: Country[] }>('/api/admin/countries', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; label: string; configured: boolean }[] }>('/api/admin/payment-providers', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ store: { name: string; defaultCurrencyCode: string; defaultRegionId: string | null; currencies: { code: string }[] } }>('/api/admin/store', opts),
  useFetch<{ data: { id: string; name: string; isDisabled: boolean }[] }>('/api/admin/sales-channels', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; title: string; token?: string; redacted: string; revokedAt: string | null }[] }>('/api/admin/api-keys', { ...opts, query: { type: 'publishable' }, default: () => ({ data: [] }) }),
  useFetch<{ data: { code: string; name: string }[] }>('/api/admin/currencies', { ...opts, default: () => ({ data: [] }) }),
])

const providerLabel = (id: string) => providers.value.data.find((p) => p.id === id)?.label ?? id
const defaultRegion = computed(() => regions.value.data.find((r) => r.id === storeData.value?.store.defaultRegionId))
const activeKey = computed(() => keys.value.data.find((k) => !k.revokedAt))

const columns: TableColumn[] = [
  { key: 'name', label: 'Region' },
  { key: 'countries', label: 'Countries' },
  { key: 'currencyCode', label: 'Currency' },
  { key: 'paymentProviders', label: 'Payment providers' },
  { key: 'tax', label: 'Tax' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]
const countriesText = (r: Region) => (r.countries.length <= 3 ? r.countries.map((c) => c.name).join(', ') : `${r.countries.slice(0, 2).map((c) => c.name).join(', ')} +${r.countries.length - 2}`)
function taxText(r: Region) {
  const rate = r.taxRates.find((x) => x.isDefault) ?? r.taxRates[0]
  const pct = rate ? `${rate.name} ${(rate.rateBps / 100).toLocaleString('en', { maximumFractionDigits: 2 })}%` : 'No tax'
  return `${pct}${r.taxInclusive ? ' · inclusive' : ''}`
}

// Dialog
const open = ref(false)
const editing = ref<Region | null>(null)
const countryFilter = ref('')
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const form = reactive({
  name: '',
  currencyCode: 'GHS',
  taxInclusive: false,
  automaticTaxes: true,
  countries: [] as string[],
  paymentProviders: [] as string[],
  taxName: 'VAT',
  taxRate: '',
})
const currencyOptions = computed<SelectOption[]>(() => currencyList.value.data.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })))
const visibleCountries = computed(() => {
  const q = countryFilter.value.trim().toLowerCase()
  return countries.value.data.filter((c) => !q || c.name.toLowerCase().includes(q) || c.iso2 === q)
})
function openForm(r?: Region) {
  editing.value = r ?? null
  errors.value = {}
  countryFilter.value = ''
  Object.assign(form, {
    name: r?.name ?? '',
    currencyCode: r?.currencyCode ?? storeData.value?.store.defaultCurrencyCode ?? 'GHS',
    taxInclusive: r?.taxInclusive ?? false,
    automaticTaxes: r?.automaticTaxes ?? true,
    countries: r?.countries.map((c) => c.iso2) ?? [],
    paymentProviders: [...(r?.paymentProviders ?? ['manual'])],
    taxName: 'VAT',
    taxRate: '',
  })
  open.value = true
}
function toggle(list: string[], v: string, on: boolean) {
  const i = list.indexOf(v)
  if (on && i < 0) list.push(v)
  if (!on && i >= 0) list.splice(i, 1)
}
async function save() {
  saving.value = true
  errors.value = {}
  const rate = form.taxRate.trim() ? Math.round(Number(form.taxRate) * 100) : null
  const body = {
    name: form.name,
    currencyCode: form.currencyCode,
    taxInclusive: form.taxInclusive,
    automaticTaxes: form.automaticTaxes,
    countries: form.countries,
    paymentProviders: form.paymentProviders,
    ...(!editing.value && rate !== null ? { defaultTaxRate: { name: form.taxName || 'Tax', code: (form.taxName || 'TAX').toUpperCase().replace(/\s+/g, '_'), rateBps: rate } } : {}),
  }
  try {
    await api(editing.value ? `/api/admin/regions/${editing.value.id}` : '/api/admin/regions', { method: 'POST', body })
    toast.success(editing.value ? 'Region saved' : 'Region created')
    open.value = false
    await Promise.all([refresh(), refreshCountries()])
  } catch (err) {
    errors.value = apiFieldErrors(err)
    errors.value.form = apiErrorMessage(err)
  } finally {
    saving.value = false
  }
}
async function onMenu(r: Region, action: string) {
  if (action === 'edit') return openForm(r)
  if (action === 'tax') return navigateTo('/admin/settings/tax-regions')
  if (action === 'delete') {
    try {
      await api(`/api/admin/regions/${r.id}`, { method: 'DELETE' })
      toast.success(`Deleted ${r.name}`)
      await Promise.all([refresh(), refreshCountries()])
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader
      :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Regions' }]"
      title="Regions"
      subtitle="A region is a set of countries that share a currency, tax rules and payment providers. Customers are placed in a region by their shipping country, and prices are resolved for that region's currency."
      :search="false"
    >
      <template #actions>
        <UiButton v-if="can('admin')" variant="primary" @click="openForm()">Create region</UiButton>
      </template>
    </AdminPageHeader>

    <UiCard flush>
      <UiTable :columns="columns" :rows="regions.data" row-key="id" :loading="pending" caption="Regions">
        <template #cell-name="{ row }">
          <span>{{ row.name }}</span>
          <UiBadge v-if="row.id === storeData?.store.defaultRegionId" style="margin-left: 8px">Default</UiBadge>
        </template>
        <template #cell-countries="{ row }">
          <span :title="row.countries.map((c) => c.name).join(', ')">{{ countriesText(row) || '—' }}</span>
        </template>
        <template #cell-currencyCode="{ row }"><UiBadge mono>{{ row.currencyCode }}</UiBadge></template>
        <template #cell-paymentProviders="{ row }">
          <span class="ink-2">{{ row.paymentProviders.map(providerLabel).join(', ') || '—' }}</span>
        </template>
        <template #cell-tax="{ row }"><span class="ink-2">{{ taxText(row) }}</span></template>
        <template #cell-actions="{ row }">
          <UiMenu
            v-if="can('admin')"
            :items="[{ label: 'Edit region', value: 'edit' }, { label: 'Tax rates', value: 'tax' }, { label: 'Delete', value: 'delete', danger: true }]"
            :label="`Actions for ${row.name}`"
            align="right"
            @select="onMenu(row, $event)"
          />
        </template>
      </UiTable>
    </UiCard>

    <div class="cards-3">
      <UiCard title="Store defaults">
        <template #actions><NuxtLink to="/admin/settings/store" class="meta link">Edit</NuxtLink></template>
        <dl class="dl">
          <dt>Store</dt>
          <dd>{{ storeData?.store.name }}</dd>
          <dt>Default currency</dt>
          <dd><UiBadge mono>{{ storeData?.store.defaultCurrencyCode }}</UiBadge></dd>
          <dt>Default region</dt>
          <dd>{{ defaultRegion?.name ?? '—' }}</dd>
          <dt>Currencies</dt>
          <dd class="mono">{{ storeData?.store.currencies.map((c) => c.code).join(' · ') }}</dd>
        </dl>
      </UiCard>

      <UiCard title="Sales channels">
        <template #actions><NuxtLink to="/admin/settings/sales-channels" class="meta link">Manage</NuxtLink></template>
        <ul class="channel-list">
          <li v-for="c in channels.data" :key="c.id">
            <span>{{ c.name }}</span>
            <UiStatusBadge :status="c.isDisabled ? 'disabled' : 'enabled'" />
          </li>
        </ul>
      </UiCard>

      <UiCard title="Publishable API key">
        <template #actions><NuxtLink to="/admin/settings/publishable-keys" class="meta link">All keys</NuxtLink></template>
        <div v-if="activeKey" class="stack" style="--stack-gap: 10px">
          <p class="meta">{{ activeKey.title }}</p>
          <div class="key-row">
            <code class="key">{{ activeKey.redacted }}</code>
            <UiButton size="sm" :disabled="!activeKey.token" @click="activeKey.token && copy(activeKey.token, 'Publishable key copied')">Copy</UiButton>
          </div>
          <p class="meta">Send as <code>x-publishable-api-key</code> from your storefront.</p>
        </div>
        <p v-else class="meta">No active publishable key. <NuxtLink to="/admin/settings/publishable-keys">Create one</NuxtLink>.</p>
      </UiCard>
    </div>

    <UiDialog v-model:open="open" :title="editing ? `Edit ${editing.name}` : 'Create region'" width="560px">
      <form id="region-form" class="stack" style="--stack-gap: 14px" @submit.prevent="save">
        <div class="form-grid">
          <UiInput v-model="form.name" label="Name" required :error="errors.name" placeholder="West Africa" />
          <UiSelect v-model="form.currencyCode" label="Currency" :options="currencyOptions" />
        </div>
        <div class="row" style="--row-gap: 20px">
          <UiCheckbox v-model="form.taxInclusive" label="Prices include tax" />
          <UiCheckbox v-model="form.automaticTaxes" label="Calculate taxes automatically" />
        </div>
        <div v-if="!editing" class="form-grid">
          <UiInput v-model="form.taxName" label="Default tax name" placeholder="VAT" />
          <UiInput v-model="form.taxRate" label="Default tax rate (%)" inputmode="decimal" placeholder="15" />
        </div>
        <fieldset class="fieldset">
          <legend class="field-label">Payment providers</legend>
          <div class="row" style="--row-gap: 16px">
            <UiCheckbox
              v-for="p in providers.data"
              :key="p.id"
              :model-value="form.paymentProviders.includes(p.id)"
              :label="p.label"
              :hint="p.configured ? undefined : 'Not configured'"
              @update:model-value="toggle(form.paymentProviders, p.id, Boolean($event))"
            />
          </div>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="field-label">Countries · {{ form.countries.length }} selected</legend>
          <UiInput v-model="countryFilter" type="search" label="Filter countries" hide-label placeholder="Filter countries" />
          <div class="country-grid">
            <UiCheckbox
              v-for="c in visibleCountries"
              :key="c.iso2"
              :model-value="form.countries.includes(c.iso2)"
              :label="c.name"
              :hint="c.regionId && c.regionId !== editing?.id ? c.regionName ?? undefined : undefined"
              :disabled="Boolean(c.regionId && c.regionId !== editing?.id)"
              @update:model-value="toggle(form.countries, c.iso2, Boolean($event))"
            />
          </div>
        </fieldset>
        <p v-if="errors.form" class="text-danger" role="alert">{{ errors.form }}</p>
      </form>
      <template #footer>
        <UiButton @click="open = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="region-form" :loading="saving">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.cards-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  align-items: start;
}
.channel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: var(--fs-ui);
}
.channel-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid var(--rule);
}
.channel-list li:last-child {
  border-bottom: 0;
}
.key-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.key {
  flex: 1;
  padding: 7px 10px;
  background: var(--putty-inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.country-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding: 2px;
}
</style>
