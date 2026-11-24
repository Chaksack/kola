<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'

definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Sales channels · Settings' })

interface Channel {
  id: string
  name: string
  description: string | null
  isDisabled: boolean
  productCount: number
  [key: string]: unknown
}

const toast = useToast()
const { can } = useAdmin()
const { data, pending, refresh } = await useFetch<{ data: Channel[] }>('/api/admin/sales-channels', { server: false, default: () => ({ data: [] }) })
const columns: TableColumn[] = [
  { key: 'name', label: 'Channel' },
  { key: 'productCount', label: 'Products', align: 'right' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]

const open = ref(false)
const editing = ref<Channel | null>(null)
const form = reactive({ name: '', description: '', isDisabled: false })
const error = ref('')
function openForm(c?: Channel) {
  editing.value = c ?? null
  Object.assign(form, { name: c?.name ?? '', description: c?.description ?? '', isDisabled: c?.isDisabled ?? false })
  error.value = ''
  open.value = true
}
async function save() {
  try {
    await api(editing.value ? `/api/admin/sales-channels/${editing.value.id}` : '/api/admin/sales-channels', { method: 'POST', body: { ...form, description: form.description || null } })
    toast.success('Sales channel saved')
    open.value = false
    await refresh()
  } catch (err) {
    error.value = apiErrorMessage(err)
  }
}
async function onMenu(c: Channel, action: string) {
  try {
    if (action === 'edit') return openForm(c)
    if (action === 'toggle') {
      await api(`/api/admin/sales-channels/${c.id}`, { method: 'POST', body: { name: c.name, description: c.description, isDisabled: !c.isDisabled } })
      toast.success(c.isDisabled ? `${c.name} enabled` : `${c.name} disabled`)
    }
    if (action === 'delete') {
      await api(`/api/admin/sales-channels/${c.id}`, { method: 'DELETE' })
      toast.success(`Deleted ${c.name}`)
    }
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader
      :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Sales channels' }]"
      title="Sales channels"
      subtitle="Each storefront, app or point of sale is a channel. Products are published per channel, and publishable keys decide which channel a storefront sells from."
      :search="false"
    >
      <template #actions>
        <UiButton v-if="can('admin')" variant="primary" @click="openForm()">Create channel</UiButton>
      </template>
    </AdminPageHeader>
    <UiCard flush>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending" caption="Sales channels">
        <template #cell-name="{ row }">
          <div>{{ row.name }}</div>
          <div v-if="row.description" class="meta">{{ row.description }}</div>
        </template>
        <template #cell-status="{ row }"><UiStatusBadge :status="row.isDisabled ? 'disabled' : 'enabled'" /></template>
        <template #cell-actions="{ row }">
          <UiMenu
            v-if="can('admin')"
            :items="[{ label: 'Edit', value: 'edit' }, { label: row.isDisabled ? 'Enable' : 'Disable', value: 'toggle' }, { label: 'Delete', value: 'delete', danger: true }]"
            :label="`Actions for ${row.name}`"
            align="right"
            @select="onMenu(row, $event)"
          />
        </template>
      </UiTable>
    </UiCard>
    <UiDialog v-model:open="open" :title="editing ? 'Edit sales channel' : 'Create sales channel'">
      <form id="channel-form" class="stack" style="--stack-gap: 14px" @submit.prevent="save">
        <UiInput v-model="form.name" label="Name" required placeholder="POS · Kumasi" />
        <UiInput v-model="form.description" label="Description" />
        <UiCheckbox v-model="form.isDisabled" label="Disabled" hint="Storefronts on this channel stop selling" />
        <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <UiButton @click="open = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="channel-form">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
