<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'UI kit · Kola' })

const toast = useToast()
const tab = ref('all')
const text = ref('')
const textError = ref('Not a valid email')
const select = ref('ghs')
const checked = ref(true)
const unchecked = ref(false)
const notes = ref('')
const dialogOpen = ref(false)
const drawerOpen = ref(false)
const offset = ref(0)

const statuses = [
  'captured', 'delivered', 'published',
  'awaiting', 'not_fulfilled', 'proposed',
  'shipped', 'partially_fulfilled',
  'refunded', 'returned', 'draft', 'canceled',
]
const columns: TableColumn[] = [
  { key: 'id', label: 'Order', mono: true },
  { key: 'customer', label: 'Customer' },
  { key: 'payment', label: 'Payment' },
  { key: 'total', label: 'Total', align: 'right' },
]
const rows = [
  { id: '#10482', customer: 'Ama Owusu', payment: 'captured', total: 45000 },
  { id: '#10481', customer: 'Kwame Mensah', payment: 'awaiting', total: 12800 },
  { id: '#10480', customer: 'Efua Boateng', payment: 'refunded', total: 8900 },
]
</script>

<template>
  <div class="stack" style="--stack-gap: 24px">
    <AdminPageHeader
      :crumbs="[{ label: 'Commerce' }, { label: 'UI kit' }]"
      title="UI kit"
      subtitle="Every component in every state, built on the Warm paper tokens."
    />

    <UiCard title="Buttons">
      <div class="stack">
        <div class="row">
          <UiButton variant="primary">Primary</UiButton>
          <UiButton>Secondary</UiButton>
          <UiButton variant="ghost">Ghost</UiButton>
          <UiButton variant="dashed">+ Add filter</UiButton>
          <UiButton variant="danger">Delete</UiButton>
        </div>
        <div class="row">
          <UiButton variant="primary" size="sm">Small primary</UiButton>
          <UiButton size="sm">Small secondary</UiButton>
          <UiButton variant="primary" loading>Saving</UiButton>
          <UiButton variant="primary" disabled>Disabled</UiButton>
          <UiButton disabled>Disabled</UiButton>
          <UiButton icon aria-label="More">⋯</UiButton>
          <UiButton to="/admin/orders" variant="secondary">As link</UiButton>
        </div>
      </div>
    </UiCard>

    <UiCard title="Status badges">
      <div class="row">
        <UiStatusBadge v-for="s in statuses" :key="s" :status="s" />
        <UiBadge>Badge</UiBadge>
        <UiBadge mono>GHS</UiBadge>
      </div>
    </UiCard>

    <UiCard title="KPI strip">
      <UiKpiStrip
        :items="[
          { label: 'Gross sales · 30d', value: 'GH₵ 48,210.00', delta: '+12.4% vs prior', tone: 'ok' },
          { label: 'Orders', value: '312', delta: '+8 this week', tone: 'ok' },
          { label: 'Average order value', value: 'GH₵ 154.52', delta: '−3.1%', tone: 'warn' },
          { label: 'Awaiting fulfillment', value: '17', delta: '4 older than 48h', tone: 'warn' },
        ]"
      />
    </UiCard>

    <UiCard title="Tabs">
      <UiTabs
        v-model="tab"
        :items="[
          { value: 'all', label: 'All', count: 312 },
          { value: 'unfulfilled', label: 'Unfulfilled', count: 17 },
          { value: 'unpaid', label: 'Unpaid', count: 5 },
          { value: 'returns', label: 'Refunds & returns', count: 3 },
        ]"
      />
      <p class="meta" style="margin-top: 8px">Selected: {{ tab }}</p>
    </UiCard>

    <UiCard title="Form controls">
      <div class="form-grid">
        <UiInput v-model="text" label="Default" placeholder="Type here" />
        <UiInput v-model="text" label="With hint" hint="Shown to customers" />
        <UiInput v-model="text" label="Error" :error="textError" />
        <UiInput model-value="Locked" label="Disabled" disabled />
        <UiInput model-value="sk_live_••••4f2a" label="Mono" mono />
        <UiInput model-value="120.00" label="With prefix" inputmode="decimal">
          <template #prefix>GH₵</template>
        </UiInput>
        <UiSelect
          v-model="select"
          label="Select"
          :options="[
            { value: 'ghs', label: 'Ghana cedi (GHS)' },
            { value: 'usd', label: 'US dollar (USD)' },
            { value: 'eur', label: 'Euro (EUR)', disabled: true },
          ]"
        />
        <UiSelect v-model="select" label="Pill select" pill :options="[{ value: 'ghs', label: 'Sort: Newest' }]" />
      </div>
      <div class="row" style="margin-top: 16px; --row-gap: 20px">
        <UiCheckbox v-model="checked" label="Checked" />
        <UiCheckbox v-model="unchecked" label="Unchecked" hint="With a hint" />
        <UiCheckbox :model-value="false" label="Disabled" disabled />
      </div>
      <div style="margin-top: 16px">
        <UiTextarea v-model="notes" label="Textarea" placeholder="Leave a note" />
      </div>
    </UiCard>

    <UiCard title="Table" flush>
      <template #actions>
        <UiButton variant="dashed" size="sm">+ Add filter</UiButton>
      </template>
      <UiTable :columns="columns" :rows="rows" row-key="id" caption="Example orders">
        <template #cell-id="{ row }"><a href="#" class="mono">{{ row.id }}</a></template>
        <template #cell-payment="{ row }"><UiStatusBadge :status="String(row.payment)" /></template>
        <template #cell-total="{ row }"><UiMoney :amount="Number(row.total)" currency="GHS" /></template>
      </UiTable>
      <UiPagination :count="53" :limit="20" :offset="offset" :shown="20" @change="offset = $event" />
    </UiCard>

    <div class="form-grid">
      <UiCard title="Table · loading" flush>
        <UiTable :columns="columns" :rows="[]" loading />
      </UiCard>
      <UiCard title="Empty state">
        <UiEmptyState title="No orders yet" description="Orders appear here when customers check out.">
          <UiButton variant="primary" size="sm">Create draft order</UiButton>
        </UiEmptyState>
      </UiCard>
    </div>

    <UiCard title="Overlays">
      <div class="row">
        <UiButton @click="dialogOpen = true">Open dialog</UiButton>
        <UiButton @click="drawerOpen = true">Open drawer</UiButton>
        <UiMenu
          :items="[
            { label: 'Edit', value: 'edit' },
            { label: 'Duplicate', value: 'dup' },
            { label: 'Disabled', value: 'x', disabled: true },
            { label: 'Delete', value: 'del', danger: true },
          ]"
          @select="toast.info(`Menu: ${$event}`)"
        />
        <UiButton @click="toast.success('Order fulfilled')">Toast · ok</UiButton>
        <UiButton @click="toast.error('Payment failed')">Toast · error</UiButton>
      </div>
    </UiCard>

    <UiCard title="Avatars and thumbnails">
      <div class="row">
        <UiAvatar name="Ama Owusu" />
        <UiAvatar name="Kwame" :size="36" />
        <UiThumb stage="warm" />
        <UiThumb stage="stone" />
        <UiThumb stage="sage" />
        <UiThumb stage="blue" />
      </div>
    </UiCard>

    <UiDialog v-model:open="dialogOpen" title="Create fulfillment" description="Choose a location and items.">
      <UiInput label="Tracking number" mono />
      <template #footer>
        <UiButton @click="dialogOpen = false">Cancel</UiButton>
        <UiButton variant="primary" @click="dialogOpen = false">Create</UiButton>
      </template>
    </UiDialog>
    <UiDrawer v-model:open="drawerOpen" title="Cart">
      <p>Drawer content.</p>
      <template #footer>
        <UiButton variant="primary" block>Checkout</UiButton>
      </template>
    </UiDrawer>
  </div>
</template>
