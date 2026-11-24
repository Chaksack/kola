<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import type { SelectOption } from '~/components/ui/Select.vue'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Customers · Kola' })

interface CustomerRow {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  hasAccount: boolean
  orderCount: number
  spent: number
  currencyCode: string
  createdAt: string
  groups: { id: string; name: string }[]
  [key: string]: unknown
}
interface Group {
  id: string
  name: string
  memberCount: number
  [key: string]: unknown
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { can } = useAdmin()
const view = computed({ get: () => (route.query.view === 'groups' ? 'groups' : 'customers'), set: (v: string) => router.replace({ query: v === 'groups' ? { view: 'groups' } : {} }) })

const list = useAdminList<CustomerRow>('/api/admin/customers', { filters: ['groupId', 'hasAccount'], defaultOrder: 'newest' })
const { data, pending, state, search, limit, refresh } = list
const { data: groups, refresh: refreshGroups } = await useFetch<{ data: Group[] }>('/api/admin/customer-groups', { server: false, default: () => ({ data: [] }) })

const groupOptions = computed<SelectOption[]>(() => [{ value: '', label: 'Group: Any' }, ...groups.value.data.map((g) => ({ value: g.id, label: g.name }))])
const columns: TableColumn[] = [
  { key: 'name', label: 'Customer' },
  { key: 'account', label: 'Account' },
  { key: 'groups', label: 'Groups' },
  { key: 'orderCount', label: 'Orders', align: 'right' },
  { key: 'spent', label: 'Spent', align: 'right' },
  { key: 'createdAt', label: 'Since' },
]
const groupColumns: TableColumn[] = [
  { key: 'name', label: 'Group' },
  { key: 'memberCount', label: 'Customers', align: 'right' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
const name = (r: CustomerRow) => [r.firstName, r.lastName].filter(Boolean).join(' ') || '—'

// Create customer
const createOpen = ref(false)
const form = reactive({ email: '', firstName: '', lastName: '', phone: '', groupIds: [] as string[] })
const error = ref('')
async function createCustomer() {
  error.value = ''
  try {
    const res = await $fetch<{ customer: { id: string } }>('/api/admin/customers', { method: 'POST', body: form })
    createOpen.value = false
    await navigateTo(`/admin/customers/${res.customer.id}`)
  } catch (err) {
    error.value = apiErrorMessage(err)
  }
}

// Groups
const groupOpen = ref(false)
const groupEditing = ref<Group | null>(null)
const groupName = ref('')
function openGroup(g?: Group) {
  groupEditing.value = g ?? null
  groupName.value = g?.name ?? ''
  groupOpen.value = true
}
async function saveGroup() {
  try {
    await api(groupEditing.value ? `/api/admin/customer-groups/${groupEditing.value.id}` : '/api/admin/customer-groups', { method: 'POST', body: { name: groupName.value } })
    groupOpen.value = false
    await refreshGroups()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
async function onGroupMenu(g: Group, action: string) {
  if (action === 'edit') return openGroup(g)
  if (action === 'view') return router.push({ query: { groupId: g.id } })
  try {
    await api(`/api/admin/customer-groups/${g.id}`, { method: 'DELETE' })
    toast.success(`Deleted ${g.name}`)
    await refreshGroups()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
function toggle(list: string[], id: string, on: boolean) {
  const i = list.indexOf(id)
  if (on && i < 0) list.push(id)
  if (!on && i >= 0) list.splice(i, 1)
}
watch(() => route.query.groupId, () => refresh())
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Commerce' }, { label: 'Customers' }]" title="Customers" subtitle="Accounts and guest shoppers, their orders and lifetime spend, and the groups that drive price lists and promotions.">
      <template #actions>
        <UiButton v-if="view === 'groups'" variant="primary" @click="openGroup()">Create group</UiButton>
        <UiButton v-else variant="primary" @click="createOpen = true">Add customer</UiButton>
      </template>
    </AdminPageHeader>

    <UiTabs v-model="view" label="Customer views" :items="[{ value: 'customers', label: 'Customers', count: data.count }, { value: 'groups', label: 'Groups', count: groups.data.length }]" />

    <UiCard v-if="view === 'customers'" flush>
      <div class="table-toolbar">
        <div class="table-toolbar__search">
          <UiInput v-model="search" type="search" label="Search customers" hide-label placeholder="Name, email or phone" />
        </div>
        <UiSelect :model-value="state.filters.groupId ?? ''" :options="groupOptions" label="Group" hide-label pill @update:model-value="list.setFilter('groupId', $event)" />
        <UiSelect
          :model-value="state.filters.hasAccount ?? ''"
          :options="[{ value: '', label: 'Account: Any' }, { value: 'true', label: 'Has account' }, { value: 'false', label: 'Guest' }]"
          label="Account"
          hide-label
          pill
          @update:model-value="list.setFilter('hasAccount', $event)"
        />
        <UiSelect
          :model-value="state.order ?? 'newest'"
          :options="[{ value: 'newest', label: 'Sort: Newest' }, { value: 'spent', label: 'Sort: Top spenders' }, { value: 'name', label: 'Sort: Name' }]"
          label="Sort"
          hide-label
          pill
          @update:model-value="list.setOrder($event)"
        />
        <span class="meta num table-toolbar__count">{{ data.count }} customers</span>
      </div>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending && !data.data.length" clickable caption="Customers" @row-click="router.push(`/admin/customers/${$event.id}`)">
        <template #cell-name="{ row }">
          <div class="row" style="--row-gap: 10px; flex-wrap: nowrap">
            <UiAvatar :name="name(row) === '—' ? row.email : name(row)" :size="28" />
            <div class="stack" style="--stack-gap: 0">
              <NuxtLink :to="`/admin/customers/${row.id}`" style="color: var(--ink)" @click.stop>{{ name(row) === '—' ? row.email : name(row) }}</NuxtLink>
              <span v-if="name(row) !== '—'" class="meta">{{ row.email }}</span>
            </div>
          </div>
        </template>
        <template #cell-account="{ row }"><UiStatusBadge :status="row.hasAccount ? 'active' : 'draft'" :label="row.hasAccount ? 'Account' : 'Guest'" /></template>
        <template #cell-groups="{ row }">
          <div class="row" style="--row-gap: 4px">
            <UiBadge v-for="g in row.groups" :key="g.id">{{ g.name }}</UiBadge>
            <span v-if="!row.groups.length" class="muted">—</span>
          </div>
        </template>
        <template #cell-spent="{ row }"><UiMoney :amount="row.spent" :currency="row.currencyCode" /></template>
        <template #cell-createdAt="{ row }"><span class="meta">{{ fmt(row.createdAt) }}</span></template>
      </UiTable>
      <UiPagination :count="data.count" :limit="limit" :offset="state.offset" :shown="data.data.length" @change="list.setOffset" />
    </UiCard>

    <UiCard v-else flush>
      <UiTable :columns="groupColumns" :rows="groups.data" row-key="id" caption="Customer groups">
        <template #cell-name="{ row }"><NuxtLink :to="{ query: { groupId: row.id } }" style="color: var(--ink)">{{ row.name }}</NuxtLink></template>
        <template #cell-actions="{ row }">
          <UiMenu
            :items="[{ label: 'View customers', value: 'view' }, { label: 'Rename', value: 'edit' }, ...(can('admin') ? [{ label: 'Delete', value: 'delete', danger: true }] : [])]"
            :label="`Actions for ${row.name}`"
            align="right"
            @select="onGroupMenu(row, $event)"
          />
        </template>
        <template #empty>No groups yet. Groups power wholesale price lists and VIP promotions.</template>
      </UiTable>
    </UiCard>

    <UiDialog v-model:open="createOpen" title="Add customer" description="They can register later with the same email to claim their history.">
      <form id="customer-form" class="stack" style="--stack-gap: 12px" @submit.prevent="createCustomer">
        <UiInput v-model="form.email" label="Email" type="email" required />
        <div class="form-grid">
          <UiInput v-model="form.firstName" label="First name" />
          <UiInput v-model="form.lastName" label="Last name" />
        </div>
        <UiInput v-model="form.phone" label="Phone" type="tel" />
        <fieldset class="groups-field">
          <legend class="field-label">Groups</legend>
          <UiCheckbox v-for="g in groups.data" :key="g.id" :model-value="form.groupIds.includes(g.id)" :label="g.name" @update:model-value="toggle(form.groupIds, g.id, Boolean($event))" />
        </fieldset>
        <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <UiButton @click="createOpen = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="customer-form">Add customer</UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="groupOpen" :title="groupEditing ? 'Rename group' : 'Create group'">
      <form id="group-form" @submit.prevent="saveGroup">
        <UiInput v-model="groupName" label="Name" required placeholder="Wholesale" />
      </form>
      <template #footer>
        <UiButton @click="groupOpen = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="group-form">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
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
