<script setup lang="ts">
import { formatMoney } from '#shared/utils/money'
import { countryName } from '#shared/utils/countries'
import { providerLabel } from '#shared/utils/providers'

export interface StoreOrderData {
  id: string
  displayId: number
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  email: string
  currencyCode: string
  createdAt: string
  isTaxInclusive: boolean
  promoCodes: string[]
  paymentProvider: string | null
  shippingAddress: { firstName?: string | null; lastName?: string | null; address1?: string | null; address2?: string | null; city?: string | null; province?: string | null; postalCode?: string | null; countryCode?: string | null; phone?: string | null } | null
  items: { id: string; title: string; variantTitle: string | null; thumbnail: string | null; quantity: number; unitPrice: number; total: number }[]
  shippingMethods: { name: string; amount: number }[]
  fulfillments: { id: string; shippedAt: string | null; deliveredAt: string | null; tracking: { number: string; url: string | null; carrier: string | null }[] }[]
  totals: { itemSubtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; total: number; refundedTotal: number }
}

const props = defineProps<{ order: StoreOrderData }>()
const m = (n: number) => formatMoney(n, props.order.currencyCode)
const a = computed(() => props.order.shippingAddress)
const placed = computed(() => new Date(props.order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
</script>

<template>
  <div class="order-view">
    <div class="order-view__meta">
      <div>
        <p class="eyebrow">Order</p>
        <p class="mono lead">#{{ order.displayId }}</p>
      </div>
      <div>
        <p class="eyebrow">Placed</p>
        <p>{{ placed }}</p>
      </div>
      <div>
        <p class="eyebrow">Payment</p>
        <UiStatusBadge :status="order.paymentStatus" />
      </div>
      <div>
        <p class="eyebrow">Delivery</p>
        <UiStatusBadge :status="order.fulfillmentStatus" />
      </div>
    </div>

    <ul class="items">
      <li v-for="i in order.items" :key="i.id" class="item">
        <StoreImage :src="i.thumbnail" :alt="i.title" :seed="i.title" ratio="1" sizes="64px" class="item__img" />
        <div class="item__text">
          <p>{{ i.title }}</p>
          <p class="meta">{{ i.variantTitle }} · {{ i.quantity }} × {{ m(i.unitPrice) }}</p>
        </div>
        <span class="num">{{ m(i.total) }}</span>
      </li>
    </ul>

    <div class="order-view__cols">
      <dl class="dl">
        <dt>Subtotal</dt>
        <dd>{{ m(order.totals.itemSubtotal) }}</dd>
        <template v-if="order.totals.discountTotal">
          <dt>Discount <span v-for="c in order.promoCodes" :key="c" class="mono">{{ c }}</span></dt>
          <dd class="text-ok">−{{ m(order.totals.discountTotal) }}</dd>
        </template>
        <dt>Shipping<span v-if="order.shippingMethods[0]" class="muted"> · {{ order.shippingMethods[0].name }}</span></dt>
        <dd>{{ m(order.totals.shippingTotal) }}</dd>
        <dt>Tax{{ order.isTaxInclusive ? ' (included)' : '' }}</dt>
        <dd>{{ m(order.totals.taxTotal) }}</dd>
        <dt class="dl-total">Total</dt>
        <dd class="dl-total">{{ m(order.totals.total) }}</dd>
        <template v-if="order.totals.refundedTotal">
          <dt>Refunded</dt>
          <dd>−{{ m(order.totals.refundedTotal) }}</dd>
        </template>
      </dl>
      <div class="stack" style="--stack-gap: 16px">
        <div v-if="a">
          <p class="eyebrow">Shipping to</p>
          <address>
            {{ a.firstName }} {{ a.lastName }}<br>
            {{ a.address1 }}<template v-if="a.address2">, {{ a.address2 }}</template><br>
            {{ [a.city, a.province, a.postalCode].filter(Boolean).join(', ') }}<br>
            {{ a.countryCode ? countryName(a.countryCode) : '' }}
          </address>
        </div>
        <div v-if="order.paymentProvider">
          <p class="eyebrow">Paid with</p>
          <p>{{ providerLabel(order.paymentProvider) }}</p>
        </div>
        <div v-for="f in order.fulfillments.filter((x) => x.tracking.length)" :key="f.id">
          <p class="eyebrow">Tracking</p>
          <p v-for="trk in f.tracking" :key="trk.number">
            {{ trk.carrier }} · <a v-if="trk.url" :href="trk.url" class="mono" rel="noopener" target="_blank">{{ trk.number }}</a><span v-else class="mono">{{ trk.number }}</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.order-view__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.order-view__meta .eyebrow {
  margin-bottom: 4px;
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
}
.item {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--rule);
}
.item__text p:first-child {
  color: var(--ink);
}
.order-view__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}
address {
  font-style: normal;
  color: var(--ink-2);
}
@media (max-width: 700px) {
  .order-view__cols {
    grid-template-columns: 1fr;
  }
}
</style>
