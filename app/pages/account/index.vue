<script setup lang="ts">
import { formatMoney } from '#shared/utils/money'
import { countryName } from '#shared/utils/countries'

definePageMeta({ middleware: 'customer-auth' })
useSeoMeta({ title: 'Your account · Kola Market', robots: 'noindex' })

interface Address {
  id: string
  label: string | null
  firstName: string | null
  lastName: string | null
  address1: string | null
  address2: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  countryCode: string | null
  phone: string | null
  isDefaultShipping: boolean
}
interface OrderRow {
  id: string
  displayId: number
  paymentStatus: string
  fulfillmentStatus: string
  total: number
  currencyCode: string
  createdAt: string
  itemCount: number
  summary: string
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { logout } = useCustomer()
const tab = computed({ get: () => String(route.query.tab ?? 'orders'), set: (v) => router.replace({ query: { tab: v } }) })

const me = ref<{ email: string; firstName: string | null; lastName: string | null; phone: string | null; addresses: Address[] } | null>(null)
const orders = ref<OrderRow[]>([])
async function load() {
  const [m, o] = await Promise.all([storeFetch<{ customer: NonNullable<typeof me.value> }>('/api/store/customers/me'), storeFetch<{ data: OrderRow[] }>('/api/store/customers/me/orders')])
  me.value = m.customer
  orders.value = o.data
  Object.assign(profile, { firstName: m.customer.firstName ?? '', lastName: m.customer.lastName ?? '', phone: m.customer.phone ?? '' })
}
onMounted(load)

const profile = reactive({ firstName: '', lastName: '', phone: '' })
async function saveProfile() {
  try {
    await storeFetch('/api/store/customers/me', { method: 'PATCH', body: { firstName: profile.firstName, lastName: profile.lastName || null, phone: profile.phone || null } })
    toast.success('Profile saved')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}

const addrOpen = ref(false)
const addrEditing = ref<Address | null>(null)
const addr = reactive({ label: '', firstName: '', lastName: '', address1: '', address2: '', city: '', province: '', postalCode: '', countryCode: 'gh', phone: '', isDefaultShipping: false })
function openAddress(a?: Address) {
  addrEditing.value = a ?? null
  Object.assign(addr, { label: '', firstName: '', lastName: '', address1: '', address2: '', city: '', province: '', postalCode: '', countryCode: 'gh', phone: '', isDefaultShipping: !me.value?.addresses.length })
  if (a) Object.assign(addr, Object.fromEntries(Object.entries(a).filter(([k]) => k in addr).map(([k, v]) => [k, v ?? (typeof addr[k as keyof typeof addr] === 'boolean' ? false : '')])))
  addrOpen.value = true
}
async function saveAddress() {
  try {
    const url = addrEditing.value ? `/api/store/customers/me/addresses/${addrEditing.value.id}` : '/api/store/customers/me/addresses'
    await storeFetch(url, { method: addrEditing.value ? 'PATCH' : 'POST', body: { ...addr } })
    addrOpen.value = false
    await load()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
async function removeAddress(a: Address) {
  await storeFetch(`/api/store/customers/me/addresses/${a.id}`, { method: 'DELETE' })
  await load()
}
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="account">
    <header class="account__head">
      <div>
        <p class="eyebrow">Account</p>
        <h1 class="section-heading">{{ me?.firstName ? `Hello, ${me.firstName}` : 'Your account' }}</h1>
        <p class="muted">{{ me?.email }}</p>
      </div>
      <UiButton @click="logout">Sign out</UiButton>
    </header>

    <UiTabs v-model="tab" label="Account sections" :items="[{ value: 'orders', label: 'Orders', count: orders.length }, { value: 'profile', label: 'Profile' }, { value: 'addresses', label: 'Addresses', count: me?.addresses.length }]" />

    <section v-if="tab === 'orders'" aria-label="Order history">
      <table v-if="orders.length" class="orders">
        <caption class="sr-only">Your orders</caption>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Date</th>
            <th scope="col">Items</th>
            <th scope="col">Status</th>
            <th scope="col" class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders" :key="o.id">
            <td><NuxtLink :to="`/account/orders/${o.id}`" class="mono">#{{ o.displayId }}</NuxtLink></td>
            <td>{{ fmtDate(o.createdAt) }}</td>
            <td class="ink-2">{{ o.summary }}<span v-if="o.itemCount > 2"> +{{ o.itemCount - 2 }}</span></td>
            <td><UiStatusBadge :status="o.fulfillmentStatus" /></td>
            <td class="num">{{ formatMoney(o.total, o.currencyCode) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">No orders yet. <NuxtLink to="/shop">Start shopping</NuxtLink>.</p>
    </section>

    <section v-else-if="tab === 'profile'" aria-label="Profile">
      <form class="stack" style="--stack-gap: 14px; max-width: 480px" @submit.prevent="saveProfile">
        <div class="form-grid">
          <UiInput v-model="profile.firstName" label="First name" autocomplete="given-name" required />
          <UiInput v-model="profile.lastName" label="Last name" autocomplete="family-name" />
        </div>
        <UiInput v-model="profile.phone" label="Phone" type="tel" autocomplete="tel" />
        <div><UiButton type="submit" variant="primary">Save</UiButton></div>
      </form>
    </section>

    <section v-else aria-label="Addresses">
      <ul class="addresses">
        <li v-for="a in me?.addresses ?? []" :key="a.id" class="address-card">
          <p>{{ a.label || 'Address' }} <UiBadge v-if="a.isDefaultShipping">Default</UiBadge></p>
          <address class="muted">
            {{ a.firstName }} {{ a.lastName }}<br>{{ a.address1 }}<br>{{ [a.city, a.province].filter(Boolean).join(', ') }}<br>{{ a.countryCode ? countryName(a.countryCode) : '' }}
          </address>
          <div class="row">
            <UiButton size="sm" @click="openAddress(a)">Edit</UiButton>
            <UiButton size="sm" variant="ghost" @click="removeAddress(a)">Remove</UiButton>
          </div>
        </li>
      </ul>
      <UiButton variant="dashed" @click="openAddress()">+ Add address</UiButton>
    </section>

    <UiDialog v-model:open="addrOpen" :title="addrEditing ? 'Edit address' : 'Add address'">
      <form id="addr-form" class="stack" style="--stack-gap: 12px" @submit.prevent="saveAddress">
        <UiInput v-model="addr.label" label="Label" placeholder="Home, Work" />
        <div class="form-grid">
          <UiInput v-model="addr.firstName" label="First name" required />
          <UiInput v-model="addr.lastName" label="Last name" />
        </div>
        <UiInput v-model="addr.address1" label="Address" required />
        <div class="form-grid">
          <UiInput v-model="addr.city" label="City" required />
          <UiInput v-model="addr.province" label="Region" />
          <UiInput v-model="addr.countryCode" label="Country (ISO-2)" mono />
          <UiInput v-model="addr.phone" label="Phone" type="tel" />
        </div>
        <UiCheckbox v-model="addr.isDefaultShipping" label="Default shipping address" />
      </form>
      <template #footer>
        <UiButton @click="addrOpen = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="addr-form">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.account {
  padding-top: 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.account__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}
.orders {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.orders th,
.orders td {
  text-align: left;
  padding: 10px 12px 10px 0;
  border-bottom: 1px solid var(--rule);
}
.orders th {
  font-size: var(--fs-meta);
  color: var(--ink-3);
  font-weight: 500;
}
.orders .num {
  text-align: right;
}
.addresses {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--gutter);
}
.address-card {
  background: var(--putty);
  border-radius: var(--radius);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
address {
  font-style: normal;
}
</style>
