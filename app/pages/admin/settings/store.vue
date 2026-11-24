<script setup lang="ts">
import type { SelectOption } from '~/components/ui/Select.vue'

definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Store · Settings' })

interface StoreData {
  name: string
  defaultCurrencyCode: string
  defaultRegionId: string | null
  defaultLocationId: string | null
  defaultSalesChannelId: string | null
  currencies: { code: string }[]
}

const toast = useToast()
const { can } = useAdmin()
const opts = { server: false } as const
const [{ data: storeData, refresh }, { data: currencies }, { data: regions }, { data: locations }, { data: channels }] = await Promise.all([
  useFetch<{ store: StoreData }>('/api/admin/store', opts),
  useFetch<{ data: { code: string; name: string }[] }>('/api/admin/currencies', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; name: string }[] }>('/api/admin/regions', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; name: string }[] }>('/api/admin/stock-locations', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; name: string; isDisabled: boolean }[] }>('/api/admin/sales-channels', { ...opts, default: () => ({ data: [] }) }),
])

const form = reactive({ name: '', defaultCurrencyCode: '', defaultRegionId: '', defaultLocationId: '', defaultSalesChannelId: '', currencies: [] as string[] })
watch(
  storeData,
  (s) => {
    if (!s) return
    Object.assign(form, {
      name: s.store.name,
      defaultCurrencyCode: s.store.defaultCurrencyCode,
      defaultRegionId: s.store.defaultRegionId ?? '',
      defaultLocationId: s.store.defaultLocationId ?? '',
      defaultSalesChannelId: s.store.defaultSalesChannelId ?? '',
      currencies: s.store.currencies.map((c) => c.code),
    })
  },
  { immediate: true },
)
const toOptions = (rows: { id: string; name: string }[]): SelectOption[] => rows.map((r) => ({ value: r.id, label: r.name }))
const saving = ref(false)
const error = ref('')
function toggle(code: string, on: boolean) {
  const i = form.currencies.indexOf(code)
  if (on && i < 0) form.currencies.push(code)
  if (!on && i >= 0) form.currencies.splice(i, 1)
}
async function save() {
  saving.value = true
  error.value = ''
  try {
    await $fetch('/api/admin/store', { method: 'POST', body: form })
    toast.success('Store settings saved')
    await refresh()
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Store' }]" title="Store" subtitle="Name, currencies and the defaults used when a request doesn't say otherwise." :search="false" />
    <form class="stack" style="--stack-gap: 16px" @submit.prevent="save">
      <UiCard title="Details">
        <div class="form-grid">
          <UiInput v-model="form.name" label="Store name" required :disabled="!can('admin')" />
          <UiSelect v-model="form.defaultCurrencyCode" label="Default currency" :options="currencies.data.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))" :disabled="!can('admin')" />
        </div>
      </UiCard>
      <UiCard title="Currencies">
        <div class="row" style="--row-gap: 20px">
          <UiCheckbox
            v-for="c in currencies.data"
            :key="c.code"
            :model-value="form.currencies.includes(c.code)"
            :label="c.code"
            :hint="c.name"
            :disabled="!can('admin') || c.code === form.defaultCurrencyCode"
            @update:model-value="toggle(c.code, Boolean($event))"
          />
        </div>
      </UiCard>
      <UiCard title="Defaults">
        <div class="form-grid">
          <UiSelect v-model="form.defaultRegionId" label="Default region" :options="toOptions(regions.data)" :disabled="!can('admin')" />
          <UiSelect v-model="form.defaultLocationId" label="Default stock location" :options="toOptions(locations.data)" :disabled="!can('admin')" />
          <UiSelect v-model="form.defaultSalesChannelId" label="Default sales channel" :options="toOptions(channels.data.filter((c) => !c.isDisabled))" :disabled="!can('admin')" />
        </div>
      </UiCard>
      <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      <div v-if="can('admin')"><UiButton type="submit" variant="primary" :loading="saving">Save</UiButton></div>
    </form>
  </div>
</template>
