<script setup lang="ts">
definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Product types & tags · Settings' })

type Kind = 'types' | 'tags'
const toast = useToast()
const { can } = useAdmin()
const { data: types, refresh: refreshTypes } = await useFetch<{ data: { id: string; value: string }[] }>('/api/admin/product-types', { server: false, default: () => ({ data: [] }) })
const { data: tags, refresh: refreshTags } = await useFetch<{ data: { id: string; value: string }[] }>('/api/admin/product-tags', { server: false, default: () => ({ data: [] }) })
const draft = reactive<Record<Kind, string>>({ types: '', tags: '' })
const refreshFor = (k: Kind) => (k === 'types' ? refreshTypes() : refreshTags())

async function add(kind: Kind) {
  const value = draft[kind].trim()
  if (!value) return
  try {
    await api(`/api/admin/product-${kind}`, { method: 'POST', body: { value } })
    draft[kind] = ''
    await refreshFor(kind)
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
async function remove(kind: Kind, id: string, value: string) {
  try {
    await api(`/api/admin/product-${kind}/${id}`, { method: 'DELETE' })
    toast.success(`Removed ${value}`)
    await refreshFor(kind)
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Product types & tags' }]" title="Product types & tags" subtitle="Types drive tax overrides and reporting. Tags are free-form labels for search and merchandising." :search="false" />
    <div class="cards-2">
      <UiCard v-for="kind in (['types', 'tags'] as const)" :key="kind" :title="kind === 'types' ? 'Product types' : 'Tags'">
        <ul class="chips">
          <li v-for="item in (kind === 'types' ? types : tags).data" :key="item.id" class="chip">
            <span>{{ item.value }}</span>
            <button v-if="can('admin')" type="button" class="chip__x" :aria-label="`Remove ${item.value}`" @click="remove(kind, item.id, item.value)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </li>
        </ul>
        <form class="row" style="margin-top: 12px" @submit.prevent="add(kind)">
          <UiInput v-model="draft[kind]" :label="kind === 'types' ? 'New type' : 'New tag'" hide-label :placeholder="kind === 'types' ? 'Stationery' : 'limited-edition'" />
          <UiButton type="submit" size="sm">Add</UiButton>
        </form>
      </UiCard>
    </div>
  </div>
</template>

<style scoped>
.cards-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  align-items: start;
}
.chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 4px 0 10px;
  background: var(--putty-inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  font-size: var(--fs-ui);
}
.chip__x {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--ink-3);
  cursor: pointer;
}
.chip__x:hover {
  background: var(--control);
  color: var(--ink);
}
</style>
