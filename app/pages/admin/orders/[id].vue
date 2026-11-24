<script setup lang="ts">
import type { MenuItem } from '~/components/ui/Menu.vue'
import type { AdminOrder } from '../../../../server/services/order-admin'
import { formatMoney, fromMinor, toMinor } from '#shared/utils/money'
import { countryName } from '#shared/utils/countries'
import { providerLabel } from '#shared/utils/providers'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const route = useRoute()
const toast = useToast()
const { can } = useAdmin()
const id = computed(() => String(route.params.id))

const { data, error } = await useFetch<{ order: AdminOrder }>(() => `/api/admin/orders/${id.value}`, { server: false })
const order = computed(() => data.value?.order ?? null)
useSeoMeta({ title: () => (order.value ? `#${order.value.displayId} · Orders · Kola` : 'Order · Kola') })
const { data: locations } = await useFetch<{ data: { id: string; name: string }[] }>('/api/admin/stock-locations', { server: false, default: () => ({ data: [] }) })
const { data: reasons } = await useFetch<{ data: { id: string; label: string }[] }>('/api/admin/return-reasons', { server: false, default: () => ({ data: [] }) })

const m = (n: number) => formatMoney(n, order.value?.currencyCode ?? 'GHS')
const busy = ref(false)

/** Run an order action, swap in the returned order and report the outcome. */
async function act<T = unknown>(path: string, body: Record<string, unknown> = {}, ok?: string): Promise<T | null> {
  busy.value = true
  try {
    const res = await api<{ order: AdminOrder; result: T }>(`/api/admin/orders/${id.value}/${path}`, { method: 'POST', body })
    data.value = { order: res.order }
    if (ok) toast.success(ok)
    return res.result
  } catch (err) {
    toast.error(apiErrorMessage(err))
    return null
  } finally {
    busy.value = false
  }
}

const unfulfilled = computed(() => order.value?.items.filter((i) => i.fulfillableQuantity > 0 && i.requiresShipping) ?? [])
const activeFulfillments = computed(() => order.value?.fulfillments.filter((f) => !f.canceledAt) ?? [])
const openReturns = computed(() => order.value?.returns.filter((r) => r.status === 'requested') ?? [])
const pendingEdit = computed(() => order.value?.changes.find((c) => c.status === 'proposed') ?? null)
const canceled = computed(() => order.value?.status === 'canceled')
const fmtDate = (d: string | Date) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const itemFor = (orderItemId: string) => order.value?.items.find((i) => i.id === orderItemId)

// ── Fulfill ─────────────────────────────────────────────────────────────
const fulfillOpen = ref(false)
const fulfillForm = reactive<{ locationId: string; qty: Record<string, number> }>({ locationId: '', qty: {} })
function openFulfill() {
  fulfillForm.locationId = locations.value.data[0]?.id ?? ''
  fulfillForm.qty = Object.fromEntries(unfulfilled.value.map((i) => [i.id, i.fulfillableQuantity]))
  fulfillOpen.value = true
}
async function submitFulfill() {
  const items = Object.entries(fulfillForm.qty).map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) || 0 })).filter((i) => i.quantity > 0)
  if (await act('fulfillments', { locationId: fulfillForm.locationId, items }, 'Fulfillment created')) fulfillOpen.value = false
}

// ── Ship ────────────────────────────────────────────────────────────────
const shipTarget = ref<string | null>(null)
const shipOpen = computed({ get: () => Boolean(shipTarget.value), set: (v) => !v && (shipTarget.value = null) })
const shipForm = reactive({ number: '', carrier: 'Kola Dispatch', url: '' })
async function submitShip() {
  const tracking = shipForm.number ? [{ number: shipForm.number, carrier: shipForm.carrier || null, url: shipForm.url || null }] : []
  if ((await act(`fulfillments/${shipTarget.value}/ship`, { tracking }, 'Marked as shipped')) !== null) {
    shipTarget.value = null
    shipForm.number = ''
  }
}

// ── Money ───────────────────────────────────────────────────────────────
const refundOpen = ref(false)
const refundForm = reactive({ amount: '', reason: 'customer_request', note: '' })
function openRefund() {
  refundForm.amount = fromMinor(order.value?.paymentSummary.refundable ?? 0, order.value!.currencyCode)
  refundOpen.value = true
}
async function submitRefund() {
  let amount: number
  try {
    amount = toMinor(refundForm.amount, order.value!.currencyCode)
  } catch {
    toast.error('Enter a valid amount')
    return
  }
  if ((await act('refund', { amount, reason: refundForm.reason, note: refundForm.note || undefined }, 'Refund issued')) !== null) refundOpen.value = false
}
const recordOpen = ref(false)
const recordForm = reactive({ amount: '', note: '' })
async function submitRecord() {
  try {
    const amount = toMinor(recordForm.amount, order.value!.currencyCode)
    if ((await act('payments', { amount, note: recordForm.note || undefined }, 'Payment recorded')) !== null) recordOpen.value = false
  } catch {
    toast.error('Enter a valid amount')
  }
}

// ── Returns ─────────────────────────────────────────────────────────────
const returnOpen = ref(false)
const returnForm = reactive<{ qty: Record<string, number>; reason: Record<string, string>; note: string }>({ qty: {}, reason: {}, note: '' })
const returnable = computed(() => order.value?.items.filter((i) => i.returnableQuantity > 0) ?? [])
function openReturn() {
  returnForm.qty = Object.fromEntries(returnable.value.map((i) => [i.id, 0]))
  returnForm.reason = Object.fromEntries(returnable.value.map((i) => [i.id, reasons.value.data[0]?.id ?? '']))
  returnForm.note = ''
  returnOpen.value = true
}
async function submitReturn() {
  const items = Object.entries(returnForm.qty).map(([itemId, q]) => ({ itemId, quantity: Number(q) || 0, reasonId: returnForm.reason[itemId] || null })).filter((i) => i.quantity > 0)
  if (!items.length) return toast.error('Choose items to return')
  if ((await act('returns', { items, note: returnForm.note || null }, 'Return requested')) !== null) returnOpen.value = false
}
const receiveTarget = ref<string | null>(null)
const receiveOpen = computed({ get: () => Boolean(receiveTarget.value), set: (v) => !v && (receiveTarget.value = null) })
const receiveForm = reactive({ locationId: '', refund: true, amount: '' })
function openReceive(r: AdminOrder['returns'][number]) {
  receiveForm.locationId = r.locationId ?? locations.value.data[0]?.id ?? ''
  receiveForm.refund = !r.exchangeId
  receiveForm.amount = fromMinor(r.refundAmount, order.value!.currencyCode)
  receiveTarget.value = r.id
}
async function submitReceive() {
  const refundAmount = receiveForm.refund && receiveForm.amount ? toMinor(receiveForm.amount, order.value!.currencyCode) : undefined
  if ((await act(`returns/${receiveTarget.value}/receive`, { locationId: receiveForm.locationId, refund: receiveForm.refund, refundAmount }, 'Return received')) !== null) receiveTarget.value = null
}

// ── Edit & exchange (shared variant picker) ─────────────────────────────
interface VariantHit {
  id: string
  title: string
  sku: string | null
  productTitle: string
}
const pickerQ = ref('')
const pickerHits = ref<VariantHit[]>([])
let pickerTimer: ReturnType<typeof setTimeout> | undefined
watch(pickerQ, (q) => {
  clearTimeout(pickerTimer)
  pickerTimer = setTimeout(async () => {
    pickerHits.value = q.trim() ? (await api<{ data: VariantHit[] }>('/api/admin/variants', { query: { q } })).data : []
  }, 200)
})

const editOpen = ref(false)
const editForm = reactive<{ qty: Record<string, number>; added: (VariantHit & { quantity: number })[]; note: string }>({ qty: {}, added: [], note: '' })
function openEdit() {
  editForm.qty = Object.fromEntries((order.value?.items ?? []).map((i) => [i.id, i.quantity]))
  editForm.added = []
  editForm.note = ''
  pickerQ.value = ''
  editOpen.value = true
}
async function submitEdit() {
  const actions = [
    ...(order.value?.items ?? []).filter((i) => Number(editForm.qty[i.id]) !== i.quantity).map((i) => (Number(editForm.qty[i.id]) === 0 ? { action: 'item_remove', itemId: i.id } : { action: 'item_update', itemId: i.id, quantity: Number(editForm.qty[i.id]) })),
    ...editForm.added.map((a) => ({ action: 'item_add', variantId: a.id, quantity: a.quantity })),
  ]
  if (!actions.length) return toast.error('Make at least one change')
  if ((await act('edits', { actions, note: editForm.note || undefined }, 'Edit proposed')) !== null) editOpen.value = false
}

const exchangeOpen = ref(false)
const exchangeForm = reactive<{ qty: Record<string, number>; added: (VariantHit & { quantity: number })[]; note: string }>({ qty: {}, added: [], note: '' })
function openExchange() {
  exchangeForm.qty = Object.fromEntries(returnable.value.map((i) => [i.id, 0]))
  exchangeForm.added = []
  exchangeForm.note = ''
  pickerQ.value = ''
  exchangeOpen.value = true
}
async function submitExchange() {
  const returnItems = Object.entries(exchangeForm.qty).map(([itemId, q]) => ({ itemId, quantity: Number(q) || 0 })).filter((i) => i.quantity > 0)
  const newItems = exchangeForm.added.map((a) => ({ variantId: a.id, quantity: a.quantity }))
  if (!returnItems.length || !newItems.length) return toast.error('Choose items to return and their replacements')
  if ((await act('exchanges', { returnItems, newItems, note: exchangeForm.note || null }, 'Exchange created')) !== null) exchangeOpen.value = false
}

// ── Cancel & notes ──────────────────────────────────────────────────────
const cancelOpen = ref(false)
const cancelReason = ref('')
async function submitCancel() {
  if ((await act('cancel', { reason: cancelReason.value || undefined }, 'Order canceled')) !== null) cancelOpen.value = false
}
const note = ref('')
async function addNote() {
  if (!note.value.trim()) return
  if ((await act('notes', { message: note.value.trim() })) !== null) note.value = ''
}
async function allocate() {
  const r = await act<{ allocated: number; short: { title: string; quantity: number }[] }>('allocate')
  if (!r) return
  if (r.short.length) toast.error(`Not enough stock for ${r.short.map((s) => `${s.quantity} × ${s.title}`).join(', ')}`)
  else toast.success(r.allocated ? `Allocated ${r.allocated} unit(s)` : 'All items are already allocated')
}

const moreItems = computed<MenuItem[]>(() => {
  const o = order.value
  if (!o) return []
  return [
    { label: o.paymentSummary.capturable > 0 && o.payments.some((p) => p.providerId === 'manual') ? 'Mark as paid (cash received)' : 'Capture payment', value: 'capture', disabled: canceled.value || o.paymentSummary.capturable <= 0 },
    { label: 'Record a payment', value: 'record', disabled: canceled.value || !can('admin') },
    { label: 'Refund', value: 'refund', disabled: o.paymentSummary.refundable <= 0 || !can('admin') },
    { label: 'Create exchange', value: 'exchange', disabled: canceled.value || !returnable.value.length || !can('admin') },
    { label: 'Allocate stock', value: 'allocate', disabled: canceled.value },
    { label: 'Cancel order', value: 'cancel', danger: true, disabled: canceled.value || !can('admin') || o.items.some((i) => i.shippedQuantity > 0) },
  ]
})
function onMore(v: string) {
  if (v === 'capture') act('capture', {}, 'Payment captured')
  if (v === 'record') {
    recordForm.amount = fromMinor(Math.max(0, order.value!.total - order.value!.paymentSummary.captured), order.value!.currencyCode)
    recordOpen.value = true
  }
  if (v === 'refund') openRefund()
  if (v === 'exchange') openExchange()
  if (v === 'allocate') allocate()
  if (v === 'cancel') cancelOpen.value = true
}

const addr = computed(() => order.value?.shippingAddress)
const customerName = computed(() => [order.value?.customer?.firstName, order.value?.customer?.lastName].filter(Boolean).join(' ') || order.value?.email || 'Guest')
</script>

<template>
  <div class="page-stack">
    <template v-if="error">
      <AdminPageHeader :back="{ label: 'Orders', to: '/admin/orders' }" title="Order not found" :search="false" />
      <UiEmptyState title="This order doesn't exist" description="It may have been deleted." />
    </template>
    <p v-else-if="!order" class="meta">Loading…</p>
    <template v-else>
      <AdminPageHeader :back="{ label: 'Orders', to: '/admin/orders' }" :title="`#${order.displayId}`" mono>
        <template #meta>
          <div class="order-meta">
            <span class="meta">Placed {{ fmtDate(order.createdAt) }} · {{ order.salesChannel?.name }}</span>
            <UiStatusBadge :status="order.paymentStatus" />
            <UiStatusBadge :status="order.fulfillmentStatus" />
            <UiStatusBadge v-if="order.status === 'canceled' || order.status === 'completed'" :status="order.status" />
          </div>
        </template>
        <template #actions>
          <UiButton :disabled="canceled || !returnable.length" @click="openReturn">Request return</UiButton>
          <UiButton :disabled="canceled || !can('admin') || Boolean(pendingEdit)" @click="openEdit">Edit order</UiButton>
          <UiMenu :items="moreItems" label="More order actions" align="right" @select="onMore" />
        </template>
      </AdminPageHeader>

      <div class="detail-grid">
        <div class="detail-main">
          <UiCard v-if="pendingEdit" title="Proposed edit">
            <p>New version v{{ pendingEdit.version }} · {{ pendingEdit.actions.length }} change(s). Difference: <strong class="num">{{ pendingEdit.differenceDue >= 0 ? '+' : '−' }}{{ m(Math.abs(pendingEdit.differenceDue)) }}</strong></p>
            <p v-if="pendingEdit.differenceDue < 0" class="meta">Confirming refunds any captured overpayment automatically.</p>
            <p v-else-if="pendingEdit.differenceDue > 0" class="meta">Collect the difference after confirming (record a payment).</p>
            <template #footer>
              <div class="row">
                <UiButton :loading="busy" @click="act(`edits/${pendingEdit.id}/decline`, {}, 'Edit declined')">Decline</UiButton>
                <UiButton variant="primary" :loading="busy" @click="act(`edits/${pendingEdit.id}/confirm`, {}, 'Order updated')">Confirm edit</UiButton>
              </div>
            </template>
          </UiCard>

          <UiCard v-if="unfulfilled.length && !canceled" flush>
            <template #header>
              <div class="card-title-row">
                <UiStatusBadge status="not_fulfilled" label="Unfulfilled" />
                <span class="meta num">{{ unfulfilled.reduce((a, i) => a + i.fulfillableQuantity, 0) }} items</span>
              </div>
            </template>
            <ul class="lines">
              <li v-for="i in unfulfilled" :key="i.id" class="line">
                <UiThumb :src="i.thumbnail" :alt="i.title" :seed="i.title" :size="44" />
                <div class="line__text">
                  <span>{{ i.title }}</span>
                  <span class="meta">{{ i.variantTitle }}<template v-if="i.sku"> · <span class="mono">{{ i.sku }}</span></template></span>
                  <span v-if="i.reservedQuantity < i.fulfillableQuantity" class="meta text-warn">{{ i.fulfillableQuantity - i.reservedQuantity }} not allocated</span>
                </div>
                <span class="num ink-2">{{ m(i.unitPrice) }} × {{ i.fulfillableQuantity }}</span>
                <span class="num">{{ m(Math.round((i.total / i.quantity) * i.fulfillableQuantity)) }}</span>
              </li>
            </ul>
            <template #footer>
              <div class="row card-actions">
                <UiButton :loading="busy" @click="allocate">Allocate stock</UiButton>
                <UiButton variant="primary" @click="openFulfill">Create fulfillment</UiButton>
              </div>
            </template>
          </UiCard>

          <UiCard v-for="(f, idx) in activeFulfillments" :key="f.id" flush>
            <template #header>
              <div class="card-title-row">
                <UiStatusBadge :status="f.deliveredAt ? 'delivered' : f.shippedAt ? 'shipped' : 'fulfilled'" />
                <span class="meta">Fulfillment {{ idx + 1 }} · {{ f.locationName }}</span>
              </div>
            </template>
            <template #actions>
              <UiMenu
                :items="[
                  { label: 'Mark as shipped', value: 'ship', disabled: Boolean(f.shippedAt) },
                  { label: 'Mark as delivered', value: 'deliver', disabled: Boolean(f.deliveredAt) },
                  { label: 'Cancel fulfillment', value: 'cancel', danger: true, disabled: Boolean(f.shippedAt) },
                ]"
                :label="`Actions for fulfillment ${idx + 1}`"
                align="right"
                @select="$event === 'ship' ? (shipTarget = f.id) : $event === 'deliver' ? act(`fulfillments/${f.id}/deliver`, {}, 'Marked as delivered') : act(`fulfillments/${f.id}/cancel`, {}, 'Fulfillment canceled')"
              />
            </template>
            <ul class="lines">
              <li v-for="fi in f.items" :key="fi.id" class="line">
                <UiThumb :src="itemFor(fi.orderItemId)?.thumbnail" :alt="fi.title" :seed="fi.title" :size="44" />
                <div class="line__text">
                  <span>{{ fi.title }}</span>
                  <span class="meta">{{ itemFor(fi.orderItemId)?.variantTitle }}<template v-if="fi.sku"> · <span class="mono">{{ fi.sku }}</span></template></span>
                </div>
                <span class="num ink-2">× {{ fi.quantity }}</span>
                <span />
              </li>
            </ul>
            <template v-if="f.tracking.length || !f.shippedAt" #footer>
              <div class="row card-actions">
                <span v-for="trk in f.tracking" :key="trk.id" class="meta">{{ trk.carrier }} · <span class="mono">{{ trk.trackingNumber }}</span></span>
                <span class="spacer" />
                <UiButton v-if="!f.shippedAt" variant="primary" size="sm" @click="shipTarget = f.id">Mark as shipped</UiButton>
              </div>
            </template>
          </UiCard>

          <UiCard v-for="r in openReturns" :key="r.id" flush>
            <template #header>
              <div class="card-title-row">
                <UiStatusBadge status="requested" :label="r.exchangeId ? 'Exchange · return requested' : 'Return requested'" />
                <span class="meta num">Refund value {{ m(r.refundAmount) }}</span>
              </div>
            </template>
            <ul class="lines">
              <li v-for="ri in r.items" :key="ri.id" class="line">
                <UiThumb :src="itemFor(ri.orderItemId)?.thumbnail" :alt="itemFor(ri.orderItemId)?.title" :seed="itemFor(ri.orderItemId)?.title" :size="44" />
                <div class="line__text">
                  <span>{{ itemFor(ri.orderItemId)?.title }}</span>
                  <span class="meta">{{ ri.reason ?? 'No reason given' }}</span>
                </div>
                <span class="num ink-2">× {{ ri.quantity }}</span>
                <span />
              </li>
            </ul>
            <template #footer>
              <div class="row card-actions">
                <UiButton size="sm" @click="act(`returns/${r.id}/cancel`, {}, 'Return canceled')">Cancel return</UiButton>
                <UiButton size="sm" variant="primary" @click="openReceive(r)">Receive items</UiButton>
              </div>
            </template>
          </UiCard>

          <UiCard title="Summary">
            <template #actions>
              <UiButton size="sm" :disabled="order.paymentSummary.refundable <= 0 || !can('admin')" @click="openRefund">Refund</UiButton>
            </template>
            <dl class="dl">
              <dt>Subtotal <span class="muted">· {{ order.items.reduce((a, i) => a + i.quantity, 0) }} items</span></dt>
              <dd>{{ m(order.itemSubtotal) }}</dd>
              <template v-if="order.discountTotal">
                <dt>Discount <span v-for="c in order.promoCodes" :key="c" class="mono code-chip">{{ c }}</span></dt>
                <dd class="text-ok">−{{ m(order.discountTotal) }}</dd>
              </template>
              <dt>Shipping <span v-if="order.shippingMethods[0]" class="muted">· {{ order.shippingMethods[0].name }}</span></dt>
              <dd>{{ m(order.shippingTotal) }}</dd>
              <dt>Tax <span class="muted">{{ order.isTaxInclusive ? '(included)' : '' }}</span></dt>
              <dd>{{ m(order.taxTotal) }}</dd>
              <dt class="dl-total">Total</dt>
              <dd class="dl-total">{{ m(order.total) }}</dd>
              <dt>Paid by customer <span v-if="order.payments[0]" class="muted">· {{ providerLabel(order.payments[0].providerId) }}</span></dt>
              <dd>{{ m(order.paymentSummary.captured) }}</dd>
              <template v-if="order.paymentSummary.refunded">
                <dt>Refunded</dt>
                <dd>−{{ m(order.paymentSummary.refunded) }}</dd>
              </template>
              <template v-if="order.paymentSummary.capturable > 0 && !canceled">
                <dt class="text-warn">Awaiting payment</dt>
                <dd class="text-warn">{{ m(order.paymentSummary.capturable) }}</dd>
              </template>
            </dl>
          </UiCard>

          <UiCard title="Activity">
            <form class="note-form" @submit.prevent="addNote">
              <UiInput v-model="note" label="Add a note" hide-label placeholder="Leave a note for the team…" />
              <UiButton type="submit" size="sm" :disabled="!note.trim()">Add note</UiButton>
            </form>
            <AdminActivityTimeline :events="order.events" />
          </UiCard>
        </div>

        <aside class="detail-side">
          <UiCard title="Customer">
            <div class="stack" style="--stack-gap: 10px">
              <div class="row" style="--row-gap: 10px; flex-wrap: nowrap">
                <UiAvatar :name="customerName" :size="32" />
                <div class="stack" style="--stack-gap: 0">
                  <NuxtLink v-if="order.customer" :to="`/admin/customers/${order.customer.id}`">{{ customerName }}</NuxtLink>
                  <span v-else>{{ customerName }}</span>
                  <span class="meta">{{ order.customer?.orderCount ?? 1 }} order{{ (order.customer?.orderCount ?? 1) === 1 ? '' : 's' }} · {{ order.customer?.hasAccount ? 'Account' : 'Guest' }}</span>
                </div>
              </div>
              <dl class="kv">
                <dt>Email</dt>
                <dd><a :href="`mailto:${order.email}`">{{ order.email }}</a></dd>
                <template v-if="order.customer?.phone || addr?.phone">
                  <dt>Phone</dt>
                  <dd>{{ order.customer?.phone ?? addr?.phone }}</dd>
                </template>
              </dl>
              <div v-if="order.customer?.groups.length" class="row" style="--row-gap: 6px">
                <UiBadge v-for="g in order.customer.groups" :key="g.id">{{ g.name }}</UiBadge>
              </div>
            </div>
          </UiCard>

          <UiCard title="Shipping address">
            <address v-if="addr" class="address">
              {{ addr.firstName }} {{ addr.lastName }}<br>
              <template v-if="addr.company">{{ addr.company }}<br></template>
              {{ addr.address1 }}<template v-if="addr.address2">, {{ addr.address2 }}</template><br>
              {{ [addr.city, addr.province, addr.postalCode].filter(Boolean).join(', ') }}<br>
              {{ addr.countryCode ? countryName(addr.countryCode) : '' }}
            </address>
            <p v-else class="meta">No shipping address.</p>
            <p v-if="order.shippingMethods[0]" class="meta" style="margin-top: 10px">{{ order.shippingMethods[0].name }} · {{ m(order.shippingMethods[0].amount) }}</p>
          </UiCard>

          <UiCard title="Details">
            <dl class="kv">
              <dt>Sales channel</dt>
              <dd>{{ order.salesChannel?.name }}</dd>
              <dt>Region</dt>
              <dd>{{ order.region?.name }} · <span class="mono">{{ order.currencyCode }}</span></dd>
              <dt>Version</dt>
              <dd>v{{ order.version }}</dd>
              <dt>Order ID</dt>
              <dd class="mono small">{{ order.id }}</dd>
              <template v-if="order.cartId">
                <dt>Cart ID</dt>
                <dd class="mono small">{{ order.cartId }}</dd>
              </template>
            </dl>
          </UiCard>
        </aside>
      </div>

      <!-- Dialogs -->
      <UiDialog v-model:open="fulfillOpen" title="Create fulfillment" description="Stock is taken from the chosen location." width="560px">
        <form id="fulfill-form" class="stack" style="--stack-gap: 14px" @submit.prevent="submitFulfill">
          <UiSelect v-model="fulfillForm.locationId" label="Ship from" :options="locations.data.map((l) => ({ value: l.id, label: l.name }))" />
          <table class="qty-table">
            <caption class="sr-only">Quantities to fulfill</caption>
            <tbody>
              <tr v-for="i in unfulfilled" :key="i.id">
                <th scope="row">{{ i.title }} <span class="meta">{{ i.variantTitle }}</span></th>
                <td><input v-model.number="fulfillForm.qty[i.id]" type="number" min="0" :max="i.fulfillableQuantity" class="qty-input" :aria-label="`Quantity of ${i.title}`"></td>
                <td class="meta num">of {{ i.fulfillableQuantity }}</td>
              </tr>
            </tbody>
          </table>
        </form>
        <template #footer>
          <UiButton @click="fulfillOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="fulfill-form" :loading="busy">Create fulfillment</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model:open="shipOpen" title="Mark as shipped" description="The customer gets a shipping email with tracking.">
        <form id="ship-form" class="stack" style="--stack-gap: 12px" @submit.prevent="submitShip">
          <UiInput v-model="shipForm.number" label="Tracking number" mono placeholder="Optional" />
          <UiInput v-model="shipForm.carrier" label="Carrier" />
          <UiInput v-model="shipForm.url" label="Tracking URL" type="url" placeholder="https://" />
        </form>
        <template #footer>
          <UiButton @click="shipTarget = null">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="ship-form" :loading="busy">Mark as shipped</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model:open="refundOpen" title="Refund" :description="`Up to ${m(order?.paymentSummary.refundable ?? 0)} can be refunded to the original payment method.`">
        <form id="refund-form" class="stack" style="--stack-gap: 12px" @submit.prevent="submitRefund">
          <UiInput v-model="refundForm.amount" label="Amount" inputmode="decimal" required>
            <template #prefix>{{ order?.currencyCode }}</template>
          </UiInput>
          <UiSelect
            v-model="refundForm.reason"
            label="Reason"
            :options="[
              { value: 'customer_request', label: 'Customer request' },
              { value: 'damaged', label: 'Damaged in transit' },
              { value: 'out_of_stock', label: 'Out of stock' },
              { value: 'goodwill', label: 'Goodwill gesture' },
              { value: 'other', label: 'Other' },
            ]"
          />
          <UiTextarea v-model="refundForm.note" label="Internal note" :rows="2" />
        </form>
        <template #footer>
          <UiButton @click="refundOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="refund-form" :loading="busy">Refund</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model:open="recordOpen" title="Record a payment" description="For money received outside a payment provider, such as a bank transfer.">
        <form id="record-form" class="stack" style="--stack-gap: 12px" @submit.prevent="submitRecord">
          <UiInput v-model="recordForm.amount" label="Amount" inputmode="decimal" required>
            <template #prefix>{{ order?.currencyCode }}</template>
          </UiInput>
          <UiInput v-model="recordForm.note" label="Reference" placeholder="Bank transfer ref" />
        </form>
        <template #footer>
          <UiButton @click="recordOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="record-form" :loading="busy">Record payment</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model:open="returnOpen" title="Request return" width="600px">
        <form id="return-form" class="stack" style="--stack-gap: 14px" @submit.prevent="submitReturn">
          <table class="qty-table">
            <caption class="sr-only">Items to return</caption>
            <tbody>
              <tr v-for="i in returnable" :key="i.id">
                <th scope="row">{{ i.title }} <span class="meta">{{ i.variantTitle }}</span></th>
                <td><input v-model.number="returnForm.qty[i.id]" type="number" min="0" :max="i.returnableQuantity" class="qty-input" :aria-label="`Return quantity of ${i.title}`"></td>
                <td>
                  <select v-model="returnForm.reason[i.id]" class="reason-select" :aria-label="`Reason for ${i.title}`">
                    <option v-for="r in reasons.data" :key="r.id" :value="r.id">{{ r.label }}</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
          <UiTextarea v-model="returnForm.note" label="Note" :rows="2" />
        </form>
        <template #footer>
          <UiButton @click="returnOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="return-form" :loading="busy">Request return</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model:open="receiveOpen" title="Receive return" description="Returned items are restocked at the location you choose.">
        <form id="receive-form" class="stack" style="--stack-gap: 12px" @submit.prevent="submitReceive">
          <UiSelect v-model="receiveForm.locationId" label="Restock at" :options="locations.data.map((l) => ({ value: l.id, label: l.name }))" />
          <UiCheckbox v-model="receiveForm.refund" label="Refund the customer" />
          <UiInput v-if="receiveForm.refund" v-model="receiveForm.amount" label="Refund amount" inputmode="decimal">
            <template #prefix>{{ order?.currencyCode }}</template>
          </UiInput>
        </form>
        <template #footer>
          <UiButton @click="receiveTarget = null">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="receive-form" :loading="busy">Receive</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model:open="editOpen" title="Edit order" description="Changes are proposed first; confirming creates a new order version." width="620px">
        <form id="edit-form" class="stack" style="--stack-gap: 14px" @submit.prevent="submitEdit">
          <table class="qty-table">
            <caption class="sr-only">Order items</caption>
            <tbody>
              <tr v-for="i in order?.items ?? []" :key="i.id">
                <th scope="row">{{ i.title }} <span class="meta">{{ i.variantTitle }}</span></th>
                <td><input v-model.number="editForm.qty[i.id]" type="number" :min="i.fulfilledQuantity" class="qty-input" :aria-label="`New quantity of ${i.title}`"></td>
                <td class="meta num">{{ m(i.unitPrice) }}</td>
              </tr>
              <tr v-for="(a, idx) in editForm.added" :key="a.id">
                <th scope="row">{{ a.productTitle }} <span class="meta">{{ a.title }} · new</span></th>
                <td><input v-model.number="a.quantity" type="number" min="1" class="qty-input" :aria-label="`Quantity of ${a.productTitle}`"></td>
                <td><UiButton size="sm" variant="ghost" @click="editForm.added.splice(idx, 1)">Remove</UiButton></td>
              </tr>
            </tbody>
          </table>
          <div class="picker">
            <UiInput v-model="pickerQ" type="search" label="Add an item" placeholder="Search products or SKU" />
            <ul v-if="pickerHits.length" class="picker__hits">
              <li v-for="h in pickerHits" :key="h.id">
                <button type="button" @click="editForm.added.push({ ...h, quantity: 1 }); pickerQ = ''">{{ h.productTitle }} · {{ h.title }} <span class="mono meta">{{ h.sku }}</span></button>
              </li>
            </ul>
          </div>
          <UiTextarea v-model="editForm.note" label="Note" :rows="2" />
        </form>
        <template #footer>
          <UiButton @click="editOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="edit-form" :loading="busy">Propose edit</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model:open="exchangeOpen" title="Create exchange" description="The customer returns items and gets replacements. The difference is settled when the return arrives." width="620px">
        <form id="exchange-form" class="stack" style="--stack-gap: 14px" @submit.prevent="submitExchange">
          <p class="field-label">Return</p>
          <table class="qty-table">
            <caption class="sr-only">Items coming back</caption>
            <tbody>
              <tr v-for="i in returnable" :key="i.id">
                <th scope="row">{{ i.title }} <span class="meta">{{ i.variantTitle }}</span></th>
                <td><input v-model.number="exchangeForm.qty[i.id]" type="number" min="0" :max="i.returnableQuantity" class="qty-input" :aria-label="`Return quantity of ${i.title}`"></td>
                <td class="meta num">of {{ i.returnableQuantity }}</td>
              </tr>
            </tbody>
          </table>
          <p class="field-label">Replacements</p>
          <ul v-if="exchangeForm.added.length" class="added">
            <li v-for="(a, idx) in exchangeForm.added" :key="a.id">
              <span>{{ a.productTitle }} · {{ a.title }}</span>
              <input v-model.number="a.quantity" type="number" min="1" class="qty-input" :aria-label="`Quantity of ${a.productTitle}`">
              <UiButton size="sm" variant="ghost" @click="exchangeForm.added.splice(idx, 1)">Remove</UiButton>
            </li>
          </ul>
          <div class="picker">
            <UiInput v-model="pickerQ" type="search" label="Add a replacement" hide-label placeholder="Search products or SKU" />
            <ul v-if="pickerHits.length" class="picker__hits">
              <li v-for="h in pickerHits" :key="h.id">
                <button type="button" @click="exchangeForm.added.push({ ...h, quantity: 1 }); pickerQ = ''">{{ h.productTitle }} · {{ h.title }} <span class="mono meta">{{ h.sku }}</span></button>
              </li>
            </ul>
          </div>
        </form>
        <template #footer>
          <UiButton @click="exchangeOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="exchange-form" :loading="busy">Create exchange</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model:open="cancelOpen" title="Cancel order" description="Reservations are released. Authorized payments are voided and captured payments refunded.">
        <UiInput v-model="cancelReason" label="Reason" placeholder="Customer request" />
        <template #footer>
          <UiButton @click="cancelOpen = false">Keep order</UiButton>
          <UiButton variant="danger" :loading="busy" @click="submitCancel">Cancel order</UiButton>
        </template>
      </UiDialog>
    </template>
  </div>
</template>

<style scoped>
.order-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-actions {
  justify-content: flex-end;
  width: 100%;
}
.lines {
  list-style: none;
  margin: 0;
  padding: 0;
}
.line {
  display: grid;
  grid-template-columns: 44px 1fr auto 96px;
  gap: 14px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--rule);
  font-size: var(--fs-ui);
}
.line:last-child {
  border-bottom: 0;
}
.line > .num:last-child {
  text-align: right;
}
.line__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.code-chip {
  padding: 1px 6px;
  background: var(--putty-inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  margin-left: 4px;
}
.note-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: var(--fs-ui);
}
.kv dt {
  color: var(--ink-3);
}
.kv dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.small {
  font-size: 11px;
}
.address {
  font-style: normal;
  font-size: var(--fs-ui);
  color: var(--ink-2);
}
.qty-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.qty-table th,
.qty-table td {
  padding: 8px 6px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  font-weight: 400;
}
.qty-input {
  width: 72px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
  text-align: right;
}
.reason-select {
  height: 30px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
  font-size: var(--fs-ui);
}
.picker {
  position: relative;
}
.picker__hits {
  list-style: none;
  margin: 4px 0 0;
  padding: 4px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--paper);
  max-height: 200px;
  overflow-y: auto;
}
.picker__hits button {
  width: 100%;
  text-align: left;
  padding: 8px;
  border: 0;
  background: none;
  border-radius: var(--radius);
  font: inherit;
  font-size: var(--fs-ui);
  cursor: pointer;
}
.picker__hits button:hover {
  background: var(--putty-inset);
}
.added {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--fs-ui);
}
.added li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
}
@media (max-width: 600px) {
  .line {
    grid-template-columns: 44px 1fr auto;
  }
  .line > :nth-child(3) {
    display: none;
  }
}
</style>
