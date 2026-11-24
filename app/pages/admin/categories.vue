<script setup lang="ts">
import type { SelectOption } from '~/components/ui/Select.vue'
import { toHandle } from '#shared/schemas/catalog'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Categories · Kola' })

interface Category {
  id: string
  name: string
  handle: string
  description: string | null
  parentId: string | null
  rank: number
  isActive: boolean
  isInternal: boolean
  productCount: number
}

const toast = useToast()
const { can } = useAdmin()
const { data, pending, refresh } = await useFetch<{ data: Category[] }>('/api/admin/categories', { server: false, default: () => ({ data: [] }) })

const tree = computed(() => {
  const out: (Category & { depth: number })[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of data.value.data.filter((x) => x.parentId === parent)) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const editing = ref<Category | null>(null)
const open = ref(false)
const form = reactive({ name: '', handle: '', description: '', parentId: '', isActive: true, isInternal: false })
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const handleTouched = ref(false)
watch(
  () => form.name,
  (n) => {
    if (!handleTouched.value) form.handle = toHandle(n)
  },
)

/** A category can't be its own ancestor, so hide it and its descendants from the parent picker. */
const parentOptions = computed<SelectOption[]>(() => {
  const blocked = new Set<string>()
  if (editing.value) {
    blocked.add(editing.value.id)
    let grew = true
    while (grew) {
      grew = false
      for (const c of data.value.data) {
        if (c.parentId && blocked.has(c.parentId) && !blocked.has(c.id)) {
          blocked.add(c.id)
          grew = true
        }
      }
    }
  }
  return [{ value: '', label: 'Top level' }, ...tree.value.filter((c) => !blocked.has(c.id)).map((c) => ({ value: c.id, label: `${'— '.repeat(c.depth)}${c.name}` }))]
})

function openForm(row?: Category, parentId?: string) {
  editing.value = row ?? null
  form.name = row?.name ?? ''
  form.handle = row?.handle ?? ''
  form.description = row?.description ?? ''
  form.parentId = row?.parentId ?? parentId ?? ''
  form.isActive = row?.isActive ?? true
  form.isInternal = row?.isInternal ?? false
  handleTouched.value = Boolean(row)
  errors.value = {}
  open.value = true
}
async function save() {
  saving.value = true
  errors.value = {}
  try {
    const url = editing.value ? `/api/admin/categories/${editing.value.id}` : '/api/admin/categories'
    await $fetch(url, { method: 'POST', body: { ...form, handle: form.handle || undefined, description: form.description || null, parentId: form.parentId || null } })
    toast.success(editing.value ? 'Category saved' : 'Category created')
    open.value = false
    await refresh()
  } catch (err) {
    errors.value = apiFieldErrors(err)
    if (!Object.keys(errors.value).length) errors.value.name = apiErrorMessage(err)
  } finally {
    saving.value = false
  }
}
async function onMenu(row: Category, action: string) {
  if (action === 'edit') return openForm(row)
  if (action === 'child') return openForm(undefined, row.id)
  if (action === 'delete') {
    try {
      await $fetch(`/api/admin/categories/${row.id}` as string, { method: 'DELETE' })
      toast.success(`Deleted ${row.name}`)
      await refresh()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Products', to: '/admin/products' }, { label: 'Categories' }]" title="Categories" subtitle="A nested tree that drives storefront navigation and category pages.">
      <template #actions>
        <UiButton variant="primary" @click="openForm()">Create category</UiButton>
      </template>
    </AdminPageHeader>
    <UiCard flush>
      <ul v-if="tree.length" class="tree" aria-label="Category tree">
        <li v-for="c in tree" :key="c.id" class="tree__row" :style="{ paddingLeft: `${16 + c.depth * 24}px` }">
          <span v-if="c.depth" class="tree__elbow" aria-hidden="true">└</span>
          <span class="tree__name">{{ c.name }}</span>
          <span class="mono meta">{{ c.handle }}</span>
          <UiStatusBadge v-if="!c.isActive" status="disabled" label="Inactive" />
          <UiBadge v-if="c.isInternal">Internal</UiBadge>
          <span class="spacer" />
          <span class="meta num">{{ c.productCount }} products</span>
          <UiMenu
            :items="[{ label: 'Edit', value: 'edit' }, { label: 'Add subcategory', value: 'child' }, ...(can('admin') ? [{ label: 'Delete', value: 'delete', danger: true }] : [])]"
            :label="`Actions for ${c.name}`"
            align="right"
            @select="onMenu(c, $event)"
          />
        </li>
      </ul>
      <UiEmptyState v-else-if="!pending" title="No categories yet" description="Create top-level categories, then nest subcategories under them." />
    </UiCard>

    <UiDialog v-model:open="open" :title="editing ? 'Edit category' : 'Create category'">
      <form id="category-form" class="stack" style="--stack-gap: 14px" @submit.prevent="save">
        <UiInput v-model="form.name" label="Name" required :error="errors.name" />
        <UiInput v-model="form.handle" label="Handle" mono :error="errors.handle" @update:model-value="handleTouched = true" />
        <UiSelect v-model="form.parentId" label="Parent" :options="parentOptions" />
        <UiTextarea v-model="form.description" label="Description" :rows="3" />
        <div class="row" style="--row-gap: 20px">
          <UiCheckbox v-model="form.isActive" label="Active" />
          <UiCheckbox v-model="form.isInternal" label="Internal" hint="Hidden from the storefront" />
        </div>
        <p v-if="errors.parentId" class="text-danger meta">{{ errors.parentId }}</p>
      </form>
      <template #footer>
        <UiButton @click="open = false">Cancel</UiButton>
        <UiButton variant="primary" type="submit" form="category-form" :loading="saving">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tree__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding-right: 12px;
  border-bottom: 1px solid var(--rule);
  font-size: var(--fs-ui);
  flex-wrap: wrap;
}
.tree__row:last-child {
  border-bottom: 0;
}
.tree__row:hover {
  background: var(--putty-inset);
}
.tree__elbow {
  color: var(--ink-3);
}
.tree__name {
  color: var(--ink);
}
</style>
