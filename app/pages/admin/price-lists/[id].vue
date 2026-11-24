<script setup lang="ts">
import { formatMoney, fromMinor, toMinor } from '#shared/utils/money'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

interface PriceRow {
  id: string
  amount: number
  currencyCode: string
  variantId: string
  variantTitle: string
  sku: string | null
  productTitle: string
  baseAmount: number | null
}
interface PriceList {
  id: string
  title: string
  description: string | null
  type: 'sale' | 'override'
  status: 'draft' | 'active'
  startsAt: string | null
  endsAt: string | null
  customerGroupIds: string[]
  prices: PriceRow[]
}
interface VariantHit {
  id: string
  title: string
  sku: string | null
  productTitle: string
}

const route = useRoute()
const toast = useToast()
const { can } = useAdmin()
const { data, error } = await useFetch<{ priceList: PriceList }>(() => `/api/admin/price-lists/${route.params.id}`, { server: false })
const list = computed(() => data.value?.priceList ?? null)
useSeoMeta({ title: () => `${list.value?.title ?? 'Price list'} · Kola` })
const { data: groups } = await useFetch<{ data: { id: string; name: string }[] }>('/api/admin/customer-groups', { server: false, default: () => ({ data: [] }) })
const { data: storeData } = await useFetch<{ store: { currencies: { code: string }[] } }>('/api/admin/store', { server: false })
const currencies = computed(() => storeData.value?.store.currencies.map((c) => c.code) ?? ['GHS'])

const form = reactive({ title: '', description: '', type: 'sale' as 'sale' | 'override', status: 'draft' as 'draft' | 'active', startsAt: '', endsAt: '', customerGroupIds: [] as string[] })
watch(
  list,
  (l) => {
    if (!l) return
    Object.assign(form, { title: l.title, description: l.description ?? '', type: l.type, status: l.status, startsAt: l.startsAt?.slice(0, 10) ?? '', endsAt: l.endsAt?.slice(0, 10) ?? '', customerGroupIds: [...l.customerGroupIds] })
  },
  { immediate: true },
)
function toggle(id: string, on: boolean) {
  const i = form.customerGroupIds.indexOf(id)
  if (on && i < 0) form.customerGroupIds.push(id)
  if (!on && i >= 0) form.customerGroupIds.splice(i, 1)
}
async function saveDetails() {
  try {
    data.value = await api<{ priceList: PriceList }>(`/api/admin/price-lists/${route.params.id}`, { method: 'POST', body: { ...form, description: form.description || null, startsAt: form.startsAt || null, endsAt: form.endsAt || null } })
    toast.success('Price list saved')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}

/** Price grid: one row per variant, one column per currency (major units). */
const grid = ref<Record<string, { label: string; sku: string | null; prices: Record<string, string>; base: Record<string, number | null> }>>({})
watch(
  list,
  (l) => {
    if (!l) return
    const g: typeof grid.value = {}
    for (const p of l.prices) {
      g[p.variantId] ??= { label: `${p.productTitle} · ${p.variantTitle}`, sku: p.sku, prices: {}, base: {} }
      g[p.variantId]!.prices[p.currencyCode] = fromMinor(p.amount, p.currencyCode)
      g[p.variantId]!.base[p.currencyCode] = p.baseAmount
    }
    grid.value = g
  },
  { immediate: true },
)
const q = ref('')
const hits = ref<VariantHit[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  clearTimeout(timer)
  timer = setTimeout(async () => (hits.value = v.trim() ? (await api<{ data: VariantHit[] }>('/api/admin/variants', { query: { q: v } })).data : []), 200)
})
function addVariant(h: VariantHit) {
  grid.value[h.id] ??= { label: `${h.productTitle} · ${h.title}`, sku: h.sku, prices: {}, base: {} }
  q.value = ''
}
async function savePrices() {
  try {
    const prices = Object.entries(grid.value).flatMap(([variantId, row]) =>
      currencies.value.filter((c) => row.prices[c]?.trim()).map((c) => ({ variantId, currencyCode: c, amount: toMinor(row.prices[c]!, c) })),
    )
    // Variants with every price cleared are removed from the list.
    const cleared = Object.entries(grid.value).filter(([, row]) => !currencies.value.some((c) => row.prices[c]?.trim()))
    data.value = await api<{ priceList: PriceList }>(`/api/admin/price-lists/${route.params.id}/prices`, { method: 'POST', body: { prices, replaceVariants: true } })
    for (const [variantId] of cleared) {
      for (const p of list.value?.prices.filter((x) => x.variantId === variantId) ?? []) await api(`/api/admin/price-lists/${route.params.id}/prices/${p.id}`, { method: 'DELETE' })
    }
    if (cleared.length) data.value = await api<{ priceList: PriceList }>(`/api/admin/price-lists/${route.params.id}`)
    toast.success('Prices saved')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Check the prices'))
  }
}
async function remove() {
  await api(`/api/admin/price-lists/${route.params.id}`, { method: 'DELETE' })
  toast.success('Price list deleted')
  await navigateTo('/admin/price-lists')
}
</script>

<template>
  <div class="page-stack">
    <UiEmptyState v-if="error" title="Price list not found" />
    <p v-else-if="!list" class="meta">Loading…</p>
    <template v-else>
      <AdminPageHeader :back="{ label: 'Price lists', to: '/admin/price-lists' }" :title="list.title" :search="false">
        <template #meta>
          <div class="row" style="margin-top: 6px">
            <UiBadge>{{ list.type === 'sale' ? 'Sale' : 'Override' }}</UiBadge>
            <UiStatusBadge :status="list.status === 'active' ? 'active' : 'draft'" />
          </div>
        </template>
        <template #actions>
          <UiMenu v-if="can('admin')" :items="[{ label: 'Delete price list', value: 'delete', danger: true }]" label="More actions" align="right" @select="remove" />
        </template>
      </AdminPageHeader>
      <div class="detail-grid">
        <div class="detail-main">
          <UiCard flush :title="`Prices · ${Object.keys(grid).length} variants`">
            <template #actions><UiButton size="sm" variant="primary" @click="savePrices">Save prices</UiButton></template>
            <div class="grid-wrap">
              <table class="pgrid">
                <caption class="sr-only">Price list prices</caption>
                <thead>
                  <tr>
                    <th scope="col">Variant</th>
                    <th v-for="c in currencies" :key="c" scope="col" class="num">{{ c }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, variantId) in grid" :key="variantId">
                    <th scope="row">{{ row.label }} <span v-if="row.sku" class="mono meta">{{ row.sku }}</span></th>
                    <td v-for="c in currencies" :key="c">
                      <input v-model="row.prices[c]" class="cell" inputmode="decimal" :aria-label="`${c} price for ${row.label}`" :placeholder="row.base[c] != null ? fromMinor(row.base[c]!, c) : ''">
                      <span v-if="row.base[c] != null" class="meta base">was {{ formatMoney(row.base[c]!, c) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <template #footer>
              <div class="add">
                <UiInput v-model="q" type="search" label="Add a variant" hide-label placeholder="Search products or SKU to add" />
                <ul v-if="hits.length" class="hits">
                  <li v-for="h in hits" :key="h.id"><button type="button" @click="addVariant(h)">{{ h.productTitle }} · {{ h.title }} <span class="mono meta">{{ h.sku }}</span></button></li>
                </ul>
                <p class="meta">Clear every price on a row to remove it.</p>
              </div>
            </template>
          </UiCard>
        </div>
        <aside class="detail-side">
          <UiCard title="Details">
            <form class="stack" style="--stack-gap: 12px" @submit.prevent="saveDetails">
              <UiInput v-model="form.title" label="Title" required />
              <UiInput v-model="form.description" label="Description" />
              <UiSelect v-model="form.type" label="Type" :options="[{ value: 'sale', label: 'Sale' }, { value: 'override', label: 'Override' }]" />
              <UiSelect v-model="form.status" label="Status" :options="[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }]" />
              <UiInput v-model="form.startsAt" label="Starts" type="date" />
              <UiInput v-model="form.endsAt" label="Ends" type="date" />
              <fieldset class="groups">
                <legend class="field-label">Customer groups</legend>
                <UiCheckbox v-for="g in groups.data" :key="g.id" :model-value="form.customerGroupIds.includes(g.id)" :label="g.name" @update:model-value="toggle(g.id, Boolean($event))" />
                <p class="meta">None selected: applies to everyone.</p>
              </fieldset>
              <div><UiButton type="submit" variant="primary">Save details</UiButton></div>
            </form>
          </UiCard>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.grid-wrap {
  overflow-x: auto;
}
.pgrid {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.pgrid th,
.pgrid td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
}
.pgrid thead th {
  font-size: var(--fs-meta);
  color: var(--ink-3);
  font-weight: 500;
}
.pgrid tbody th {
  font-weight: 400;
}
.cell {
  width: 96px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
  text-align: right;
}
.base {
  display: block;
  margin-top: 2px;
}
.add {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hits {
  list-style: none;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--paper);
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
  cursor: pointer;
  border-radius: var(--radius);
}
.hits button:hover {
  background: var(--putty-inset);
}
.groups {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
