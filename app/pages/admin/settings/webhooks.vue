<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import { WEBHOOK_EVENTS } from '#shared/utils/webhook-events'

definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Webhooks · Settings' })

interface Endpoint {
  id: string
  url: string
  description: string | null
  events: string[]
  status: 'enabled' | 'disabled'
  secretLast4: string
  createdAt: string
  last7Days: Record<string, number>
  [key: string]: unknown
}
interface Delivery {
  id: string
  eventName: string
  status: 'pending' | 'succeeded' | 'failed'
  attempts: number
  lastResponseStatus: number | null
  lastError: string | null
  nextAttemptAt: string | null
  createdAt: string
  [key: string]: unknown
}

const toast = useToast()
const copy = useClipboard()
const { can } = useAdmin()
const { data, refresh, pending, error } = await useFetch<{ data: Endpoint[] }>('/api/admin/webhooks', { server: false, default: () => ({ data: [] }) })
const columns: TableColumn[] = [
  { key: 'url', label: 'Endpoint' },
  { key: 'events', label: 'Events' },
  { key: 'health', label: 'Last 7 days' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]

const open = ref(false)
const whForm = reactive<{ url: string; description: string; events: string[] }>({ url: '', description: '', events: ['order.placed'] })
const secret = ref('')
const canCreate = computed(() => whForm.events.length > 0)
const formError = ref('')
function openCreate() {
  Object.assign(whForm, { url: '', description: '', events: ['order.placed'] })
  secret.value = ''
  formError.value = ''
  open.value = true
}
function toggle(e: string, on: boolean) {
  const i = whForm.events.indexOf(e)
  if (on && i < 0) whForm.events.push(e)
  if (!on && i >= 0) whForm.events.splice(i, 1)
}
async function create() {
  formError.value = ''
  try {
    const res = await $fetch<{ secret: string }>('/api/admin/webhooks', { method: 'POST', body: { ...whForm, description: whForm.description || null } })
    secret.value = res.secret
    await refresh()
  } catch (err) {
    formError.value = apiErrorMessage(err)
  }
}

const selected = ref<Endpoint | null>(null)
const deliveries = ref<Delivery[]>([])
const drawerOpen = computed({ get: () => Boolean(selected.value), set: (v) => !v && (selected.value = null) })
async function openDeliveries(e: Endpoint) {
  selected.value = e
  deliveries.value = (await api<{ data: Delivery[] }>(`/api/admin/webhooks/${e.id}/deliveries`)).data
}
async function onMenu(e: Endpoint, action: string) {
  try {
    if (action === 'deliveries') return openDeliveries(e)
    if (action === 'test') {
      const r = await api<{ outcome: string; delivery: Delivery }>(`/api/admin/webhooks/${e.id}/test`, { method: 'POST' })
      if (r.outcome === 'succeeded') toast.success(`Ping delivered (HTTP ${r.delivery.lastResponseStatus})`)
      else toast.error(`Ping failed: ${r.delivery.lastError}`)
    }
    if (action === 'toggle') await api(`/api/admin/webhooks/${e.id}`, { method: 'POST', body: { status: e.status === 'enabled' ? 'disabled' : 'enabled' } })
    if (action === 'delete') await api(`/api/admin/webhooks/${e.id}`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
async function retry(d: Delivery) {
  await api(`/api/admin/webhooks/deliveries/${d.id}/retry`, { method: 'POST' })
  if (selected.value) await openDeliveries(selected.value)
}
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader
      :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Webhooks' }]"
      title="Webhooks"
      subtitle="Send signed events to your systems. Each request carries Kola-Signature: t=<unix>,v1=<HMAC-SHA256 of “t.body”>. Failed deliveries are retried with backoff for up to a day."
      :search="false"
    >
      <template #actions>
        <UiButton v-if="can('admin')" variant="primary" @click="openCreate">Add endpoint</UiButton>
      </template>
    </AdminPageHeader>
    <p v-if="error" class="meta">Only admins can manage webhooks.</p>
    <UiCard v-else flush>
      <UiTable :columns="columns" :rows="data.data" row-key="id" :loading="pending" caption="Webhook endpoints">
        <template #cell-url="{ row }">
          <div class="stack" style="--stack-gap: 0">
            <button type="button" class="link-btn mono" @click="openDeliveries(row)">{{ row.url }}</button>
            <span class="meta">{{ row.description ?? `Secret ••••${row.secretLast4}` }}</span>
          </div>
        </template>
        <template #cell-events="{ row }"><span class="ink-2">{{ row.events.includes('*') ? 'All events' : row.events.length > 2 ? `${row.events.slice(0, 2).join(', ')} +${row.events.length - 2}` : row.events.join(', ') }}</span></template>
        <template #cell-health="{ row }">
          <span class="num meta"><span class="text-ok">{{ row.last7Days.succeeded ?? 0 }} ok</span> · <span :class="{ 'text-danger': row.last7Days.failed }">{{ row.last7Days.failed ?? 0 }} failed</span> · {{ row.last7Days.pending ?? 0 }} retrying</span>
        </template>
        <template #cell-status="{ row }"><UiStatusBadge :status="row.status" /></template>
        <template #cell-actions="{ row }">
          <UiMenu
            :items="[{ label: 'Recent deliveries', value: 'deliveries' }, { label: 'Send test ping', value: 'test' }, { label: row.status === 'enabled' ? 'Disable' : 'Enable', value: 'toggle' }, { label: 'Delete', value: 'delete', danger: true }]"
            :label="`Actions for ${row.url}`"
            align="right"
            @select="onMenu(row, $event)"
          />
        </template>
        <template #empty>No endpoints yet.</template>
      </UiTable>
    </UiCard>

    <UiDialog v-model:open="open" title="Add webhook endpoint" width="560px">
      <form v-if="!secret" id="wh-form" class="stack" style="--stack-gap: 12px" @submit.prevent="create">
        <UiInput v-model="whForm.url" label="URL" type="url" mono required placeholder="https://erp.example.com/kola" />
        <UiInput v-model="whForm.description" label="Description" placeholder="ERP order sync" />
        <fieldset class="events">
          <legend class="field-label">Events</legend>
          <UiCheckbox :model-value="whForm.events.includes('*')" label="All events" @update:model-value="toggle('*', Boolean($event))" />
          <UiCheckbox v-for="e in WEBHOOK_EVENTS" :key="e" :model-value="whForm.events.includes(e)" :label="e" :disabled="whForm.events.includes('*')" @update:model-value="toggle(e, Boolean($event))" />
        </fieldset>
        <p v-if="formError" class="text-danger" role="alert">{{ formError }}</p>
      </form>
      <div v-else class="stack" style="--stack-gap: 10px">
        <p>Use this secret to verify signatures. It won't be shown again.</p>
        <UiInput :model-value="secret" label="Signing secret" mono readonly />
      </div>
      <template #footer>
        <template v-if="!secret">
          <UiButton @click="open = false">Cancel</UiButton>
          <UiButton variant="primary" :disabled="!canCreate" @click="create">Add endpoint</UiButton>
        </template>
        <template v-else>
          <UiButton @click="copy(secret, 'Secret copied')">Copy secret</UiButton>
          <UiButton variant="primary" @click="open = false">Done</UiButton>
        </template>
      </template>
    </UiDialog>

    <UiDrawer v-model:open="drawerOpen" :title="selected?.url ?? 'Deliveries'">
      <ul class="deliveries">
        <li v-for="d in deliveries" :key="d.id">
          <div class="row" style="--row-gap: 8px">
            <UiStatusBadge :status="d.status === 'succeeded' ? 'delivered' : d.status === 'failed' ? 'failed' : 'pending'" :label="d.status" />
            <span class="mono">{{ d.eventName }}</span>
            <span class="spacer" />
            <UiButton v-if="d.status !== 'succeeded'" size="sm" @click="retry(d)">Retry now</UiButton>
          </div>
          <p class="meta">{{ fmt(d.createdAt) }} · {{ d.attempts }} attempt(s){{ d.lastResponseStatus ? ` · HTTP ${d.lastResponseStatus}` : '' }}{{ d.nextAttemptAt ? ` · next ${fmt(d.nextAttemptAt)}` : '' }}</p>
          <p v-if="d.lastError" class="meta text-danger">{{ d.lastError }}</p>
        </li>
        <li v-if="!deliveries.length" class="meta">No deliveries yet.</li>
      </ul>
    </UiDrawer>
  </div>
</template>

<style scoped>
.link-btn {
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  color: var(--ink);
  cursor: pointer;
  font-size: 12px;
}
.events {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}
.events legend {
  margin-bottom: 8px;
}
.deliveries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.deliveries li {
  padding: 12px 0;
  border-bottom: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
