<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import type { MenuItem } from '~/components/ui/Menu.vue'

const props = defineProps<{ type: 'publishable' | 'secret' }>()

interface KeyRow {
  id: string
  title: string
  token?: string
  redacted: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
  salesChannels: { id: string; name: string }[]
  [key: string]: unknown
}
interface Channel {
  id: string
  name: string
  isDisabled: boolean
}

const toast = useToast()
const copy = useClipboard()
const { can } = useAdmin()
const isSecret = computed(() => props.type === 'secret')

const { data, pending, refresh } = await useFetch<{ data: KeyRow[] }>('/api/admin/api-keys', {
  query: { type: props.type },
  server: false,
  default: () => ({ data: [] }),
})
const { data: channels } = await useFetch<{ data: Channel[] }>('/api/admin/sales-channels', {
  server: false,
  immediate: !isSecret.value,
  default: () => ({ data: [] }),
})

const columns = computed<TableColumn[]>(() => [
  { key: 'title', label: 'Title' },
  { key: 'token', label: 'Key' },
  isSecret.value ? { key: 'lastUsedAt', label: 'Last used' } : { key: 'channels', label: 'Sales channels' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
])
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

function menuFor(row: KeyRow): MenuItem[] {
  if (!can('admin')) return []
  const items: MenuItem[] = []
  if (!isSecret.value && row.token) items.push({ label: 'Copy key', value: 'copy' })
  if (!isSecret.value && !row.revokedAt) items.push({ label: 'Edit sales channels', value: 'channels' })
  items.push(row.revokedAt ? { label: 'Delete', value: 'delete', danger: true } : { label: 'Revoke', value: 'revoke', danger: true })
  return items
}

async function onMenu(row: KeyRow, action: string) {
  try {
    if (action === 'copy' && row.token) return copy(row.token, 'Publishable key copied')
    if (action === 'channels') return openChannels(row)
    if (action === 'revoke') {
      await $fetch(`/api/admin/api-keys/${row.id}/revoke`, { method: 'POST' })
      toast.success(`Revoked "${row.title}"`)
    }
    if (action === 'delete') {
      await $fetch(`/api/admin/api-keys/${row.id}`, { method: 'DELETE' })
      toast.success(`Deleted "${row.title}"`)
    }
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}

// Create
const createOpen = ref(false)
const form = reactive<{ title: string; salesChannelIds: string[] }>({ title: '', salesChannelIds: [] })
const createdToken = ref('')
const creating = ref(false)
const createError = ref('')
function openCreate() {
  form.title = ''
  form.salesChannelIds = channels.value.data.filter((c) => !c.isDisabled).slice(0, 1).map((c) => c.id)
  createdToken.value = ''
  createError.value = ''
  createOpen.value = true
}
async function create() {
  creating.value = true
  createError.value = ''
  try {
    const res = await $fetch<{ token: string }>('/api/admin/api-keys', {
      method: 'POST',
      body: { title: form.title, type: props.type, salesChannelIds: isSecret.value ? undefined : form.salesChannelIds },
    })
    await refresh()
    if (isSecret.value) createdToken.value = res.token
    else {
      createOpen.value = false
      toast.success('Publishable key created')
    }
  } catch (err) {
    createError.value = apiErrorMessage(err)
  } finally {
    creating.value = false
  }
}

// Edit channels
const channelsTarget = ref<KeyRow | null>(null)
const channelsOpen = computed({ get: () => Boolean(channelsTarget.value), set: (v) => !v && (channelsTarget.value = null) })
const channelSelection = ref<string[]>([])
function openChannels(row: KeyRow) {
  channelSelection.value = row.salesChannels.map((c) => c.id)
  channelsTarget.value = row
}
function toggle(list: string[], id: string, on: boolean) {
  const i = list.indexOf(id)
  if (on && i < 0) list.push(id)
  if (!on && i >= 0) list.splice(i, 1)
}
async function saveChannels() {
  if (!channelsTarget.value) return
  try {
    await $fetch(`/api/admin/api-keys/${channelsTarget.value.id}`, { method: 'PATCH', body: { salesChannelIds: channelSelection.value } })
    toast.success('Sales channels updated')
    channelsTarget.value = null
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader
      :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: isSecret ? 'Secret API keys' : 'Publishable API keys' }]"
      :title="isSecret ? 'Secret API keys' : 'Publishable API keys'"
      :subtitle="
        isSecret
          ? 'Server-to-server access to the admin API. Send as Authorization: Bearer sk_…. Keys act with the admin role and are stored hashed, so a key is shown only once.'
          : 'Storefronts send a publishable key in the x-publishable-api-key header. The key decides which sales channels, and so which products, a storefront can see.'
      "
      :search="false"
    >
      <template #actions>
        <UiButton v-if="can('admin')" variant="primary" @click="openCreate">Create key</UiButton>
      </template>
    </AdminPageHeader>

    <UiCard flush>
      <UiTable v-if="pending || data.data.length" :columns="columns" :rows="data.data" row-key="id" :loading="pending" :caption="isSecret ? 'Secret keys' : 'Publishable keys'">
        <template #cell-token="{ row }"><span class="mono">{{ row.redacted }}</span></template>
        <template #cell-channels="{ row }">
          <span v-if="row.salesChannels.length">{{ row.salesChannels.map((c) => c.name).join(', ') }}</span>
          <span v-else class="meta">None</span>
        </template>
        <template #cell-lastUsedAt="{ row }"><span class="meta">{{ fmt(row.lastUsedAt) }}</span></template>
        <template #cell-status="{ row }"><UiStatusBadge :status="row.revokedAt ? 'revoked' : 'active'" /></template>
        <template #cell-createdAt="{ row }"><span class="meta">{{ fmt(row.createdAt) }}</span></template>
        <template #cell-actions="{ row }">
          <UiMenu v-if="menuFor(row).length" :items="menuFor(row)" :label="`Actions for ${row.title}`" align="right" @select="onMenu(row, $event)" />
        </template>
      </UiTable>
      <UiEmptyState v-else :title="isSecret ? 'No secret keys' : 'No publishable keys'" :description="isSecret ? 'Create one for integrations that call the admin API.' : 'Create one for each storefront.'" />
    </UiCard>

    <UiDialog v-model:open="createOpen" :title="isSecret ? 'Create secret key' : 'Create publishable key'">
      <form v-if="!createdToken" id="create-key" class="stack" style="--stack-gap: 14px" @submit.prevent="create">
        <UiInput v-model="form.title" label="Title" required :placeholder="isSecret ? 'ERP sync' : 'Mobile app'" :error="createError || undefined" />
        <fieldset v-if="!isSecret" class="fieldset">
          <legend class="field-label">Sales channels</legend>
          <UiCheckbox
            v-for="c in channels.data"
            :key="c.id"
            :model-value="form.salesChannelIds.includes(c.id)"
            :label="c.name"
            :hint="c.isDisabled ? 'Disabled' : undefined"
            @update:model-value="toggle(form.salesChannelIds, c.id, Boolean($event))"
          />
        </fieldset>
      </form>
      <div v-else class="stack" style="--stack-gap: 10px">
        <p>Copy this key now. You won't be able to see it again.</p>
        <UiInput :model-value="createdToken" label="Secret key" mono readonly />
      </div>
      <template #footer>
        <template v-if="!createdToken">
          <UiButton @click="createOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="create-key" :loading="creating">Create</UiButton>
        </template>
        <template v-else>
          <UiButton @click="copy(createdToken, 'Secret key copied')">Copy key</UiButton>
          <UiButton variant="primary" @click="createOpen = false">Done</UiButton>
        </template>
      </template>
    </UiDialog>

    <UiDialog v-model:open="channelsOpen" title="Sales channels" :description="channelsTarget?.title">
      <div class="stack" style="--stack-gap: 8px">
        <UiCheckbox
          v-for="c in channels.data"
          :key="c.id"
          :model-value="channelSelection.includes(c.id)"
          :label="c.name"
          :hint="c.isDisabled ? 'Disabled' : undefined"
          @update:model-value="toggle(channelSelection, c.id, Boolean($event))"
        />
      </div>
      <template #footer>
        <UiButton @click="channelsTarget = null">Cancel</UiButton>
        <UiButton variant="primary" @click="saveChannels">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fieldset legend {
  margin-bottom: 6px;
}
</style>
