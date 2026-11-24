<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import { toHandle } from '#shared/schemas/catalog'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Collections · Kola' })

interface CollectionRow {
  id: string
  title: string
  handle: string
  description: string | null
  productCount: number
  [key: string]: unknown
}

const toast = useToast()
const { can } = useAdmin()
const { data, pending, refresh } = await useFetch<{ data: CollectionRow[]; count: number }>('/api/admin/collections', { server: false, default: () => ({ data: [], count: 0 }) })

const columns: TableColumn[] = [
  { key: 'title', label: 'Collection' },
  { key: 'handle', label: 'Handle', mono: true },
  { key: 'productCount', label: 'Products', align: 'right' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]

const editing = ref<CollectionRow | null>(null)
const open = ref(false)
const form = reactive({ title: '', handle: '', description: '' })
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const handleTouched = ref(false)
watch(
  () => form.title,
  (t) => {
    if (!handleTouched.value) form.handle = toHandle(t)
  },
)

function openForm(row?: CollectionRow) {
  editing.value = row ?? null
  form.title = row?.title ?? ''
  form.handle = row?.handle ?? ''
  form.description = row?.description ?? ''
  handleTouched.value = Boolean(row)
  errors.value = {}
  open.value = true
}
async function save() {
  saving.value = true
  errors.value = {}
  try {
    const url = editing.value ? `/api/admin/collections/${editing.value.id}` : '/api/admin/collections'
    await $fetch(url, { method: 'POST', body: { title: form.title, handle: form.handle || undefined, description: form.description || null } })
    toast.success(editing.value ? 'Collection saved' : 'Collection created')
    open.value = false
    await refresh()
  } catch (err) {
    errors.value = apiFieldErrors(err)
    if (!Object.keys(errors.value).length) errors.value.title = apiErrorMessage(err)
  } finally {
    saving.value = false
  }
}
async function remove(row: CollectionRow) {
  try {
    await $fetch(`/api/admin/collections/${row.id}` as string, { method: 'DELETE' })
    toast.success(`Deleted ${row.title}`)
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
function onMenu(row: CollectionRow, action: string) {
  if (action === 'edit') openForm(row)
  if (action === 'delete') remove(row)
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Products', to: '/admin/products' }, { label: 'Collections' }]" title="Collections" subtitle="Curated groups of products for merchandising and storefront pages.">
      <template #actions>
        <UiButton variant="primary" @click="openForm()">Create collection</UiButton>
      </template>
    </AdminPageHeader>
    <UiCard flush>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending" caption="Collections">
        <template #cell-title="{ row }">
          <div>
            <NuxtLink :to="{ path: '/admin/products', query: { collectionId: row.id } }" style="color: var(--ink)">{{ row.title }}</NuxtLink>
            <div v-if="row.description" class="meta">{{ row.description }}</div>
          </div>
        </template>
        <template #cell-actions="{ row }">
          <UiMenu
            :items="[{ label: 'Edit', value: 'edit' }, ...(can('admin') ? [{ label: 'Delete', value: 'delete', danger: true }] : [])]"
            :label="`Actions for ${row.title}`"
            align="right"
            @select="onMenu(row, $event)"
          />
        </template>
        <template #empty>No collections yet.</template>
      </UiTable>
    </UiCard>

    <UiDialog v-model:open="open" :title="editing ? 'Edit collection' : 'Create collection'">
      <form id="collection-form" class="stack" style="--stack-gap: 14px" @submit.prevent="save">
        <UiInput v-model="form.title" label="Title" required :error="errors.title" />
        <UiInput v-model="form.handle" label="Handle" mono :error="errors.handle" hint="/collections/handle" @update:model-value="handleTouched = true" />
        <UiTextarea v-model="form.description" label="Description" :rows="3" />
      </form>
      <template #footer>
        <UiButton @click="open = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="collection-form" :loading="saving">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
