<script setup lang="ts">
import type { SelectOption } from '~/components/ui/Select.vue'
import { formatMoney, fromMinor, toMinor } from '#shared/utils/money'

definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Locations & shipping · Settings' })

interface Address {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
}
interface OptionRow {
  id: string
  name: string
  serviceZoneId: string
  shippingProfileId: string
  priceType: 'flat' | 'calculated'
  description: string | null
  isReturn: boolean
  adminOnly: boolean
  rules: { attribute: string; operator: string; value: unknown }[]
  prices: { currencyCode: string; regionId: string | null; amount: number }[]
}
interface Zone {
  id: string
  name: string
  countries: string[]
  shippingOptions: OptionRow[]
}
interface Location {
  id: string
  name: string
  address: Address | null
  serviceZones: Zone[]
}
interface Setup {
  defaultLocationId: string | null
  countries: { iso2: string; name: string }[]
  profiles: { id: string; name: string; type: string }[]
  locations: Location[]
}

const toast = useToast()
const { can } = useAdmin()
const { data, refresh, pending } = await useFetch<Setup>('/api/admin/fulfillment/setup', { server: false })
const { data: storeData } = await useFetch<{ store: { currencies: { code: string }[] } }>('/api/admin/store', { server: false })
const currencies = computed(() => storeData.value?.store.currencies.map((c) => c.code) ?? [])
const countryName = (iso: string) => data.value?.countries.find((c) => c.iso2 === iso)?.name ?? iso.toUpperCase()
const profileName = (id: string) => data.value?.profiles.find((p) => p.id === id)?.name ?? '—'
const addressLine = (a: Address | null) => (a ? [a.address1, a.address2, a.city, a.province, a.postalCode, a.countryCode?.toUpperCase()].filter(Boolean).join(', ') : '')

async function call(fn: () => Promise<unknown>, ok: string) {
  try {
    await fn()
    toast.success(ok)
    await refresh()
    return true
  } catch (err) {
    toast.error(apiErrorMessage(err))
    return false
  }
}

// ── Location dialog ─────────────────────────────────────────────────────
const locOpen = ref(false)
const locEditing = ref<Location | null>(null)
const locForm = reactive({ name: '', address1: '', address2: '', city: '', province: '', postalCode: '', countryCode: 'gh', phone: '' })
function openLocation(l?: Location) {
  locEditing.value = l ?? null
  Object.assign(locForm, { name: l?.name ?? '', address1: '', address2: '', city: '', province: '', postalCode: '', countryCode: 'gh', phone: '' }, l?.address ?? {})
  locOpen.value = true
}
async function saveLocation() {
  const { name, ...address } = locForm
  const ok = await call(
    () => $fetch<unknown, string>(locEditing.value ? `/api/admin/stock-locations/${locEditing.value.id}` : '/api/admin/stock-locations', { method: 'POST', body: { name, address } }),
    locEditing.value ? 'Location saved' : 'Location created',
  )
  if (ok) locOpen.value = false
}

// ── Zone dialog ─────────────────────────────────────────────────────────
const zoneOpen = ref(false)
const zoneLocation = ref<Location | null>(null)
const zoneEditing = ref<Zone | null>(null)
const zoneForm = reactive<{ name: string; countries: string[] }>({ name: '', countries: [] })
function openZone(loc: Location, z?: Zone) {
  zoneLocation.value = loc
  zoneEditing.value = z ?? null
  zoneForm.name = z?.name ?? ''
  zoneForm.countries = [...(z?.countries ?? [])]
  zoneOpen.value = true
}
function toggleCountry(iso: string, on: boolean) {
  const i = zoneForm.countries.indexOf(iso)
  if (on && i < 0) zoneForm.countries.push(iso)
  if (!on && i >= 0) zoneForm.countries.splice(i, 1)
}
async function saveZone() {
  const url: string = zoneEditing.value ? `/api/admin/service-zones/${zoneEditing.value.id}` : `/api/admin/stock-locations/${zoneLocation.value!.id}/service-zones`
  const ok = await call(() => $fetch<unknown, string>(url, { method: 'POST', body: zoneForm }), zoneEditing.value ? 'Service zone saved' : 'Service zone created')
  if (ok) zoneOpen.value = false
}

// ── Shipping option dialog ──────────────────────────────────────────────
const optOpen = ref(false)
const optEditing = ref<OptionRow | null>(null)
const optError = ref('')
const optForm = reactive({
  name: '',
  serviceZoneId: '',
  shippingProfileId: '',
  description: '',
  isReturn: false,
  adminOnly: false,
  prices: {} as Record<string, string>,
})
const profileOptions = computed<SelectOption[]>(() => (data.value?.profiles ?? []).map((p) => ({ value: p.id, label: p.name })))
function openOption(zone: Zone, o?: OptionRow) {
  optEditing.value = o ?? null
  optError.value = ''
  Object.assign(optForm, {
    name: o?.name ?? '',
    serviceZoneId: zone.id,
    shippingProfileId: o?.shippingProfileId ?? data.value?.profiles.find((p) => p.type === 'default')?.id ?? '',
    description: o?.description ?? '',
    isReturn: o?.isReturn ?? false,
    adminOnly: o?.adminOnly ?? false,
    prices: Object.fromEntries((o?.prices ?? []).filter((p) => !p.regionId).map((p) => [p.currencyCode, fromMinor(p.amount, p.currencyCode)])),
  })
  optOpen.value = true
}
async function saveOption() {
  optError.value = ''
  let prices: { currencyCode: string; amount: number }[]
  try {
    prices = currencies.value.filter((c) => optForm.prices[c]?.trim()).map((c) => ({ currencyCode: c, amount: toMinor(optForm.prices[c]!, c) }))
  } catch (err) {
    optError.value = err instanceof Error ? err.message : 'Invalid price'
    return
  }
  const body = {
    name: optForm.name,
    serviceZoneId: optForm.serviceZoneId,
    shippingProfileId: optForm.shippingProfileId,
    description: optForm.description || null,
    isReturn: optForm.isReturn,
    adminOnly: optForm.adminOnly,
    rules: optEditing.value?.rules ?? [],
    prices,
  }
  const ok = await call(() => $fetch<unknown, string>(optEditing.value ? `/api/admin/shipping-options/${optEditing.value.id}` : '/api/admin/shipping-options', { method: 'POST', body }), 'Shipping option saved')
  if (ok) optOpen.value = false
}

function priceText(o: OptionRow) {
  if (!o.prices.length) return '—'
  return o.prices.filter((p) => !p.regionId).map((p) => (p.amount === 0 ? `Free (${p.currencyCode})` : formatMoney(p.amount, p.currencyCode))).join(' · ')
}

async function onLocationMenu(l: Location, action: string) {
  if (action === 'edit') return openLocation(l)
  if (action === 'zone') return openZone(l)
  if (action === 'delete') await call(() => $fetch<unknown, string>(`/api/admin/stock-locations/${l.id}` as string, { method: 'DELETE' }), `Deleted ${l.name}`)
}
async function onZoneMenu(l: Location, z: Zone, action: string) {
  if (action === 'edit') return openZone(l, z)
  if (action === 'option') return openOption(z)
  if (action === 'delete') await call(() => $fetch<unknown, string>(`/api/admin/service-zones/${z.id}` as string, { method: 'DELETE' }), `Deleted ${z.name}`)
}
async function onOptionMenu(z: Zone, o: OptionRow, action: string) {
  if (action === 'edit') return openOption(z, o)
  if (action === 'delete') await call(() => $fetch<unknown, string>(`/api/admin/shipping-options/${o.id}` as string, { method: 'DELETE' }), `Deleted ${o.name}`)
}

// ── Profiles ────────────────────────────────────────────────────────────
const profileName_ = ref('')
async function addProfile() {
  if (!profileName_.value.trim()) return
  const ok = await call(() => $fetch<unknown, string>('/api/admin/shipping-profiles', { method: 'POST', body: { name: profileName_.value, type: 'custom' } }), 'Shipping profile added')
  if (ok) profileName_.value = ''
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader
      :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Locations & shipping' }]"
      title="Locations & shipping"
      subtitle="Where stock lives, which countries each location ships to, and the delivery options customers can pick at checkout."
      :search="false"
    >
      <template #actions>
        <UiButton v-if="can('admin')" variant="primary" @click="openLocation()">Add location</UiButton>
      </template>
    </AdminPageHeader>

    <p v-if="pending && !data" class="meta">Loading…</p>

    <UiCard v-for="l in data?.locations ?? []" :key="l.id" flush>
      <template #header>
        <div class="loc-head">
          <h2 class="loc-title">{{ l.name }}</h2>
          <UiBadge v-if="l.id === data?.defaultLocationId">Default</UiBadge>
          <span class="meta">{{ addressLine(l.address) }}</span>
        </div>
      </template>
      <template #actions>
        <UiMenu
          v-if="can('admin')"
          :items="[{ label: 'Edit location', value: 'edit' }, { label: 'Add service zone', value: 'zone' }, { label: 'Delete location', value: 'delete', danger: true }]"
          :label="`Actions for ${l.name}`"
          align="right"
          @select="onLocationMenu(l, $event)"
        />
      </template>

      <div v-if="!l.serviceZones.length" class="zone-empty">
        <p class="meta">This location doesn't ship anywhere yet.</p>
        <UiButton v-if="can('admin')" size="sm" variant="dashed" @click="openZone(l)">+ Add service zone</UiButton>
      </div>
      <section v-for="z in l.serviceZones" :key="z.id" class="zone">
        <div class="zone__head">
          <div>
            <p class="eyebrow">Service zone</p>
            <h3 class="zone__name">{{ z.name }}</h3>
            <p class="meta">{{ z.countries.map(countryName).join(', ') }}</p>
          </div>
          <UiMenu
            v-if="can('admin')"
            :items="[{ label: 'Add shipping option', value: 'option' }, { label: 'Edit zone', value: 'edit' }, { label: 'Delete zone', value: 'delete', danger: true }]"
            :label="`Actions for zone ${z.name}`"
            align="right"
            @select="onZoneMenu(l, z, $event)"
          />
        </div>
        <table v-if="z.shippingOptions.length" class="options">
          <caption class="sr-only">Shipping options in {{ z.name }}</caption>
          <thead>
            <tr>
              <th scope="col">Option</th>
              <th scope="col">Profile</th>
              <th scope="col">Price</th>
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in z.shippingOptions" :key="o.id">
              <td>
                {{ o.name }}
                <UiBadge v-if="o.isReturn">Return</UiBadge>
                <UiBadge v-if="o.adminOnly">Admin only</UiBadge>
                <div v-if="o.description" class="meta">{{ o.description }}</div>
              </td>
              <td class="ink-2">{{ profileName(o.shippingProfileId) }}</td>
              <td class="num">{{ priceText(o) }}</td>
              <td class="actions">
                <UiMenu
                  v-if="can('admin')"
                  :items="[{ label: 'Edit', value: 'edit' }, { label: 'Delete', value: 'delete', danger: true }]"
                  :label="`Actions for ${o.name}`"
                  align="right"
                  @select="onOptionMenu(z, o, $event)"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="zone-empty">
          <UiButton v-if="can('admin')" size="sm" variant="dashed" @click="openOption(z)">+ Add shipping option</UiButton>
        </div>
      </section>
    </UiCard>

    <UiCard title="Shipping profiles">
      <p class="meta" style="margin-bottom: 12px">Profiles group products that ship the same way. A cart needs a shipping method for every profile in it.</p>
      <ul class="profiles">
        <li v-for="p in data?.profiles ?? []" :key="p.id">
          {{ p.name }} <span class="meta">· {{ p.type.replace('_', ' ') }}</span>
        </li>
      </ul>
      <form v-if="can('admin')" class="row" style="margin-top: 12px" @submit.prevent="addProfile">
        <UiInput v-model="profileName_" label="New profile name" hide-label placeholder="Fragile items" />
        <UiButton type="submit" size="sm">Add profile</UiButton>
      </form>
    </UiCard>

    <UiDialog v-model:open="locOpen" :title="locEditing ? 'Edit location' : 'Add location'">
      <form id="loc-form" class="stack" style="--stack-gap: 12px" @submit.prevent="saveLocation">
        <UiInput v-model="locForm.name" label="Name" required />
        <UiInput v-model="locForm.address1" label="Address" autocomplete="address-line1" />
        <div class="form-grid">
          <UiInput v-model="locForm.city" label="City" />
          <UiInput v-model="locForm.province" label="Region" />
          <UiInput v-model="locForm.postalCode" label="Postal code" />
          <UiInput v-model="locForm.countryCode" label="Country (ISO-2)" mono />
        </div>
        <UiInput v-model="locForm.phone" label="Phone" type="tel" />
      </form>
      <template #footer>
        <UiButton @click="locOpen = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="loc-form">Save</UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="zoneOpen" :title="zoneEditing ? 'Edit service zone' : 'Add service zone'" :description="zoneLocation?.name">
      <form id="zone-form" class="stack" style="--stack-gap: 12px" @submit.prevent="saveZone">
        <UiInput v-model="zoneForm.name" label="Name" required placeholder="Greater Accra" />
        <fieldset class="countries">
          <legend class="field-label">Countries</legend>
          <UiCheckbox
            v-for="c in data?.countries ?? []"
            :key="c.iso2"
            :model-value="zoneForm.countries.includes(c.iso2)"
            :label="c.name"
            @update:model-value="toggleCountry(c.iso2, Boolean($event))"
          />
        </fieldset>
        <p class="meta">Countries come from your regions. Add a country to a region first to ship there.</p>
      </form>
      <template #footer>
        <UiButton @click="zoneOpen = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="zone-form" :disabled="!zoneForm.countries.length">Save</UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="optOpen" :title="optEditing ? 'Edit shipping option' : 'Add shipping option'">
      <form id="opt-form" class="stack" style="--stack-gap: 12px" @submit.prevent="saveOption">
        <UiInput v-model="optForm.name" label="Name" required placeholder="Standard delivery" />
        <UiInput v-model="optForm.description" label="Description" placeholder="2–4 working days" />
        <UiSelect v-model="optForm.shippingProfileId" label="Shipping profile" :options="profileOptions" />
        <fieldset class="prices">
          <legend class="field-label">Flat price per currency</legend>
          <div class="form-grid">
            <UiInput v-for="c in currencies" :key="c" v-model="optForm.prices[c]" :label="c" inputmode="decimal" placeholder="Leave empty if unavailable" />
          </div>
        </fieldset>
        <div class="row" style="--row-gap: 20px">
          <UiCheckbox v-model="optForm.isReturn" label="Return option" />
          <UiCheckbox v-model="optForm.adminOnly" label="Admin only" hint="Hidden at checkout" />
        </div>
        <p v-if="optError" class="text-danger" role="alert">{{ optError }}</p>
      </form>
      <template #footer>
        <UiButton @click="optOpen = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="opt-form">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.loc-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.loc-title {
  font-size: 16px;
}
.zone {
  padding: 14px 16px;
  border-top: 1px solid var(--rule);
}
.zone:first-child {
  border-top: 0;
}
.zone__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.zone__name {
  font-size: 14px;
  margin: 2px 0;
}
.zone-empty {
  padding: 14px 16px;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.options {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: var(--fs-ui);
}
.options th,
.options td {
  padding: 8px 0;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
}
.options th {
  font-size: var(--fs-meta);
  color: var(--ink-3);
  font-weight: 500;
}
.options tbody tr:last-child td {
  border-bottom: 0;
}
.options td + td,
.options th + th {
  padding-left: 16px;
}
.options .actions {
  text-align: right;
  width: 48px;
}
.profiles {
  margin: 0;
  padding-left: 18px;
  font-size: var(--fs-ui);
}
.countries,
.prices {
  border: 0;
  padding: 0;
  margin: 0;
}
.countries {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}
.countries legend,
.prices legend {
  margin-bottom: 8px;
}
</style>
