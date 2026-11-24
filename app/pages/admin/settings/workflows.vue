<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'

definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Workflows · Settings' })

interface Log {
  id: string
  actorType: string
  actorLabel: string
  action: string
  resourceType: string
  resourceId: string | null
  data: Record<string, unknown> | null
  createdAt: string
  [key: string]: unknown
}
const route = useRoute()
const router = useRouter()
const filter = computed(() => String(route.query.action ?? ''))
const offset = ref(0)
const { data, pending, error } = await useFetch<{ data: Log[]; count: number; limit: number }>('/api/admin/audit-logs', {
  server: false,
  query: computed(() => ({ action: filter.value || undefined, offset: offset.value, limit: 50 })),
  default: () => ({ data: [], count: 0, limit: 50 }),
})
const { data: crons } = await useFetch<{ data: Log[] }>('/api/admin/audit-logs', { server: false, query: { action: 'cron.', limit: 10 }, default: () => ({ data: [] }) })

const workflows = [
  {
    name: 'Complete cart',
    trigger: 'POST /api/store/carts/:id/complete · Idempotency-Key',
    steps: [
      { name: 'Validate cart', compensate: null },
      { name: 'Reserve inventory', compensate: 'Release reservations' },
      { name: 'Authorize payment', compensate: 'Void (Stripe) or refund (Paystack)' },
      { name: 'Create order', compensate: null },
      { name: 'Emit order.placed', compensate: null },
    ],
  },
]
const jobs = [
  { name: 'cart-expiry', schedule: 'Hourly', description: 'Deletes expired carts and releases their reservations' },
  { name: 'reservation-release', schedule: 'Hourly at :30', description: 'Releases checkout reservations older than 15 minutes' },
  { name: 'webhook-retry', schedule: 'Every 15 minutes', description: 'Delivers webhook retries that are due' },
]
const lastRun = (name: string) => crons.value.data.find((c) => c.action === `cron.${name}`)
const columns: TableColumn[] = [
  { key: 'createdAt', label: 'When' },
  { key: 'actorLabel', label: 'Actor' },
  { key: 'action', label: 'Action', mono: true },
  { key: 'resource', label: 'Resource' },
]
const fmt = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader
      :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Workflows' }]"
      title="Workflows"
      subtitle="Multi-step operations with compensation, the scheduled jobs that keep the store tidy, and an audit log of every change."
      :search="false"
    />

    <UiCard v-for="w in workflows" :key="w.name" :title="w.name">
      <template #actions><span class="mono meta">{{ w.trigger }}</span></template>
      <ol class="steps">
        <li v-for="(s, i) in w.steps" :key="s.name">
          <span class="steps__num num">{{ i + 1 }}</span>
          <span>{{ s.name }}</span>
          <span v-if="s.compensate" class="meta">↺ {{ s.compensate }}</span>
        </li>
      </ol>
      <p class="meta" style="margin-top: 12px">If a step fails, completed steps are undone in reverse order and the cart stays open.</p>
    </UiCard>

    <UiCard flush title="Scheduled jobs">
      <table class="jobs">
        <caption class="sr-only">Scheduled jobs</caption>
        <tbody>
          <tr v-for="j in jobs" :key="j.name">
            <td><span class="mono">{{ j.name }}</span><div class="meta">{{ j.description }}</div></td>
            <td class="ink-2">{{ j.schedule }}</td>
            <td class="meta">{{ lastRun(j.name) ? `Last run ${fmt(lastRun(j.name)!.createdAt)}` : 'Not run yet' }}</td>
          </tr>
        </tbody>
      </table>
    </UiCard>

    <UiCard flush title="Audit log">
      <template #actions>
        <UiSelect
          :model-value="filter"
          :options="[{ value: '', label: 'All actions' }, { value: 'order.', label: 'Orders' }, { value: 'product.', label: 'Products' }, { value: 'auth.', label: 'Sign-ins' }, { value: 'api_key.', label: 'API keys' }, { value: 'user.', label: 'Users' }, { value: 'webhook.', label: 'Webhooks' }, { value: 'cron.', label: 'Jobs' }]"
          label="Filter actions"
          hide-label
          pill
          @update:model-value="router.replace({ query: $event ? { action: $event } : {} }); offset = 0"
        />
      </template>
      <p v-if="error" class="meta" style="padding: 16px">Only admins can view the audit log.</p>
      <UiTable v-else :columns="columns" :rows="data.data" row-key="id" :loading="pending" caption="Audit log">
        <template #cell-createdAt="{ row }"><span class="meta">{{ fmt(row.createdAt) }}</span></template>
        <template #cell-resource="{ row }">
          <NuxtLink v-if="row.resourceType === 'order' && row.resourceId" :to="`/admin/orders/${row.resourceId}`" class="mono">{{ row.resourceId }}</NuxtLink>
          <NuxtLink v-else-if="row.resourceType === 'product' && row.resourceId" :to="`/admin/products/${row.resourceId}`" class="mono">{{ row.resourceId }}</NuxtLink>
          <span v-else class="mono meta">{{ row.resourceType }}{{ row.resourceId ? ` · ${row.resourceId}` : '' }}</span>
        </template>
      </UiTable>
      <UiPagination v-if="!error" :count="data.count" :limit="50" :offset="offset" :shown="data.data.length" @change="offset = $event" />
    </UiCard>
  </div>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.steps li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--paper);
  min-width: 160px;
  font-size: var(--fs-ui);
}
.steps__num {
  font-size: var(--fs-meta);
  color: var(--ink-3);
}
.jobs {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.jobs td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--rule);
}
.jobs tr:last-child td {
  border-bottom: 0;
}
</style>
