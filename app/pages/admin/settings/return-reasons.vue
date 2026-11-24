<script setup lang="ts">
definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Return reasons · Settings' })

const toast = useToast()
const { can } = useAdmin()
const { data, refresh } = await useFetch<{ data: { id: string; value: string; label: string; description: string | null }[] }>('/api/admin/return-reasons', { server: false, default: () => ({ data: [] }) })
const label = ref('')
async function add() {
  if (!label.value.trim()) return
  try {
    await $fetch('/api/admin/return-reasons', { method: 'POST', body: { label: label.value } })
    label.value = ''
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
async function remove(id: string) {
  await api(`/api/admin/return-reasons/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Return reasons' }]" title="Return reasons" subtitle="Reasons staff pick when requesting a return. They appear in return reports." :search="false" />
    <UiCard flush>
      <ul class="reasons">
        <li v-for="r in data.data" :key="r.id">
          <span>{{ r.label }}</span>
          <span class="mono meta">{{ r.value }}</span>
          <span class="spacer" />
          <UiButton v-if="can('admin')" size="sm" variant="ghost" :aria-label="`Remove ${r.label}`" @click="remove(r.id)">Remove</UiButton>
        </li>
      </ul>
      <template v-if="can('admin')" #footer>
        <form class="row" @submit.prevent="add">
          <UiInput v-model="label" label="New reason" hide-label placeholder="Changed my mind" />
          <UiButton type="submit" size="sm">Add reason</UiButton>
        </form>
      </template>
    </UiCard>
  </div>
</template>

<style scoped>
.reasons {
  list-style: none;
  margin: 0;
  padding: 0;
}
.reasons li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--rule);
  font-size: var(--fs-ui);
}
.reasons li:last-child {
  border-bottom: 0;
}
</style>
