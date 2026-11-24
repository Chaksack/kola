<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import { formatMoney } from '#shared/utils/money'
import { countryName } from '#shared/utils/countries'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

interface Customer {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  hasAccount: boolean
  createdAt: string
  groups: { id: string; name: string }[]
  addresses: { id: string; label: string | null; firstName: string | null; lastName: string | null; address1: string | null; city: string | null; countryCode: string | null; phone: string | null; isDefaultShipping: boolean }[]
  orders: { id: string; displayId: number; createdAt: string; paymentStatus: string; fulfillmentStatus: string; total: number; currencyCode: string; [key: string]: unknown }[]
  totals: { currencyCode: string; spent: number; orders: number }[]
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { can } = useAdmin()
const { data, error } = await useFetch<{ customer: Customer }>(() => `/api/admin/customers/${route.params.id}`, { server: false })
const c = computed(() => data.value?.customer ?? null)
const fullName = computed(() => [c.value?.firstName, c.value?.lastName].filter(Boolean).join(' ') || c.value?.email || 'Customer')
useSeoMeta({ title: () => `${fullName.value} · Customers · Kola` })
const { data: groups } = await useFetch<{ data: { id: string; name: string }[] }>('/api/admin/customer-groups', { server: false, default: () => ({ data: [] }) })

const columns: TableColumn[] = [
  { key: 'displayId', label: 'Order' },
  { key: 'createdAt', label: 'Date' },
  { key: 'paymentStatus', label: 'Payment' },
  { key: 'fulfillmentStatus', label: 'Fulfillment' },
  { key: 'total', label: 'Total', align: 'right' },
]

const editOpen = ref(false)
const form = reactive({ email: '', firstName: '', lastName: '', phone: '', groupIds: [] as string[] })
function openEdit() {
  if (!c.value) return
  Object.assign(form, { email: c.value.email, firstName: c.value.firstName ?? '', lastName: c.value.lastName ?? '', phone: c.value.phone ?? '', groupIds: c.value.groups.map((g) => g.id) })
  editOpen.value = true
}
function toggle(id: string, on: boolean) {
  const i = form.groupIds.indexOf(id)
  if (on && i < 0) form.groupIds.push(id)
  if (!on && i >= 0) form.groupIds.splice(i, 1)
}
async function save() {
  try {
    const res = await api<{ customer: Customer }>(`/api/admin/customers/${route.params.id}`, { method: 'POST', body: form })
    data.value = res
    editOpen.value = false
    toast.success('Customer saved')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
const deleteOpen = ref(false)
async function remove() {
  try {
    await api(`/api/admin/customers/${route.params.id}`, { method: 'DELETE' })
    toast.success('Customer deleted')
    await navigateTo('/admin/customers')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="page-stack">
    <template v-if="error">
      <AdminPageHeader :back="{ label: 'Customers', to: '/admin/customers' }" title="Customer not found" :search="false" />
    </template>
    <p v-else-if="!c" class="meta">Loading…</p>
    <template v-else>
      <AdminPageHeader :back="{ label: 'Customers', to: '/admin/customers' }" :title="fullName">
        <template #meta>
          <div class="row" style="margin-top: 6px">
            <span class="meta">{{ c.email }} · customer since {{ fmt(c.createdAt) }}</span>
            <UiStatusBadge :status="c.hasAccount ? 'active' : 'draft'" :label="c.hasAccount ? 'Account' : 'Guest'" />
          </div>
        </template>
        <template #actions>
          <UiButton @click="openEdit">Edit</UiButton>
          <UiMenu v-if="can('admin')" :items="[{ label: 'Delete customer', value: 'delete', danger: true }]" label="More customer actions" align="right" @select="deleteOpen = true" />
        </template>
      </AdminPageHeader>

      <UiKpiStrip
        :items="[
          { label: 'Orders', value: String(c.orders.length) },
          ...c.totals.map((t) => ({ label: `Lifetime spend · ${t.currencyCode}`, value: formatMoney(t.spent, t.currencyCode) })),
          { label: 'Average order', value: c.totals[0] ? formatMoney(Math.round(c.totals[0].spent / Math.max(1, c.totals[0].orders)), c.totals[0].currencyCode) : '—' },
        ]"
      />

      <div class="detail-grid">
        <div class="detail-main">
          <UiCard flush title="Orders">
            <UiTable :columns="columns" :rows="c.orders" row-key="id" clickable caption="Orders" @row-click="router.push(`/admin/orders/${$event.id}`)">
              <template #cell-displayId="{ row }"><NuxtLink :to="`/admin/orders/${row.id}`" class="mono" @click.stop>#{{ row.displayId }}</NuxtLink></template>
              <template #cell-createdAt="{ row }"><span class="ink-2">{{ fmt(row.createdAt) }}</span></template>
              <template #cell-paymentStatus="{ row }"><UiStatusBadge :status="row.paymentStatus" /></template>
              <template #cell-fulfillmentStatus="{ row }"><UiStatusBadge :status="row.fulfillmentStatus" /></template>
              <template #cell-total="{ row }"><UiMoney :amount="row.total" :currency="row.currencyCode" /></template>
              <template #empty>No orders yet.</template>
            </UiTable>
          </UiCard>
        </div>
        <aside class="detail-side">
          <UiCard title="Contact">
            <dl class="kv">
              <dt>Email</dt>
              <dd><a :href="`mailto:${c.email}`">{{ c.email }}</a></dd>
              <dt>Phone</dt>
              <dd>{{ c.phone ?? '—' }}</dd>
            </dl>
          </UiCard>
          <UiCard title="Groups">
            <div v-if="c.groups.length" class="row" style="--row-gap: 6px">
              <UiBadge v-for="g in c.groups" :key="g.id">{{ g.name }}</UiBadge>
            </div>
            <p v-else class="meta">Not in any group.</p>
          </UiCard>
          <UiCard title="Addresses">
            <ul v-if="c.addresses.length" class="addresses">
              <li v-for="a in c.addresses" :key="a.id">
                <p>{{ a.label ?? 'Address' }} <UiBadge v-if="a.isDefaultShipping">Default</UiBadge></p>
                <p class="meta">{{ a.address1 }}, {{ a.city }}, {{ a.countryCode ? countryName(a.countryCode) : '' }}</p>
              </li>
            </ul>
            <p v-else class="meta">No saved addresses.</p>
          </UiCard>
        </aside>
      </div>

      <UiDialog v-model:open="editOpen" title="Edit customer">
        <form id="edit-customer" class="stack" style="--stack-gap: 12px" @submit.prevent="save">
          <UiInput v-model="form.email" label="Email" type="email" required />
          <div class="form-grid">
            <UiInput v-model="form.firstName" label="First name" />
            <UiInput v-model="form.lastName" label="Last name" />
          </div>
          <UiInput v-model="form.phone" label="Phone" type="tel" />
          <fieldset class="groups-field">
            <legend class="field-label">Groups</legend>
            <UiCheckbox v-for="g in groups.data" :key="g.id" :model-value="form.groupIds.includes(g.id)" :label="g.name" @update:model-value="toggle(g.id, Boolean($event))" />
          </fieldset>
        </form>
        <template #footer>
          <UiButton @click="editOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="edit-customer">Save</UiButton>
        </template>
      </UiDialog>
      <UiDialog v-model:open="deleteOpen" title="Delete customer" description="Their account is closed. Past orders keep their contact details.">
        <template #footer>
          <UiButton @click="deleteOpen = false">Cancel</UiButton>
          <UiButton variant="danger" @click="remove">Delete</UiButton>
        </template>
      </UiDialog>
    </template>
  </div>
</template>

<style scoped>
.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: var(--fs-ui);
}
.kv dt {
  color: var(--ink-3);
}
.kv dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.addresses {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: var(--fs-ui);
}
.groups-field {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.groups-field legend {
  margin-bottom: 8px;
}
</style>
