<script setup lang="ts">
import type { StoreRegion } from '~/composables/useRegion'
import { formatMoney } from '#shared/utils/money'
import { countryName } from '#shared/utils/countries'
import { configValue } from '#shared/utils/config'
import { emailSchema } from '#shared/schemas/common'

useSeoMeta({ title: 'Checkout · Kola Market', robots: 'noindex' })

interface ShippingOption {
  id: string
  name: string
  description: string | null
  amount: number
  currencyCode: string
}
interface Session {
  id: string
  providerId: string
  amount: number
  data: { accessCode?: string; reference?: string; clientSecret?: string }
}
interface StripeLike {
  elements(opts: { clientSecret: string; appearance?: unknown }): { create(type: 'payment'): { mount(el: HTMLElement): void; destroy(): void } }
  confirmPayment(opts: { elements: unknown; redirect: 'if_required'; confirmParams: { return_url: string } }): Promise<{ error?: { message?: string } }>
}
declare global {
  interface Window {
    Stripe?: (key: string) => StripeLike
    PaystackPop?: new () => { resumeTransaction(accessCode: string, cb: { onSuccess: () => void; onCancel: () => void; onError?: (e: { message: string }) => void }): void }
  }
}

const cartStore = useCartStore()
const { regions, setRegion } = useRegion()
const { customer } = useCustomer()
const config = useRuntimeConfig()
const toast = useToast()
const cart = computed(() => cartStore.cart)
const loaded = ref(false)

onMounted(async () => {
  await cartStore.load()
  loaded.value = true
  if (cart.value && !cart.value.items.length) await navigateTo('/cart')
  hydrateForms()
  if (cart.value?.shippingAddress?.countryCode) await loadShippingOptions()
})

// ── Step state ─────────────────────────────────────────────────────────
type StepKey = 'contact' | 'address' | 'delivery' | 'payment' | 'review'
const editing = ref<StepKey | null>(null)
const addressDone = computed(() => {
  const a = cart.value?.shippingAddress
  return Boolean(a?.firstName && a.address1 && a.city && a.countryCode)
})
const deliveryDone = computed(() => Boolean(cart.value?.shippingMethods.length))
const session = ref<Session | null>(null)
const current = computed<StepKey>(() => {
  if (editing.value) return editing.value
  if (!cart.value?.email) return 'contact'
  if (!addressDone.value) return 'address'
  if (!deliveryDone.value) return 'delivery'
  if (!session.value) return 'payment'
  return 'review'
})
const order: StepKey[] = ['contact', 'address', 'delivery', 'payment', 'review']
const stateOf = (k: StepKey) => (k === current.value ? 'active' : order.indexOf(k) < order.indexOf(current.value) ? 'done' : 'todo')

// ── Contact ────────────────────────────────────────────────────────────
const email = ref('')
const emailError = ref('')
function hydrateForms() {
  email.value = cart.value?.email ?? customer.value?.email ?? ''
  const a = cart.value?.shippingAddress
  if (a) Object.assign(address, { ...address, ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v ?? ''])) })
  if (!address.countryCode) address.countryCode = cartRegion.value?.countries[0]?.iso2 ?? 'gh'
}
async function saveContact() {
  const parsed = emailSchema.safeParse(email.value)
  if (!parsed.success) {
    emailError.value = 'Enter a valid email'
    return
  }
  emailError.value = ''
  await cartStore.updateCart({ email: parsed.data })
  editing.value = null
}

// ── Address ────────────────────────────────────────────────────────────
const address = reactive({ firstName: '', lastName: '', company: '', address1: '', address2: '', city: '', province: '', postalCode: '', countryCode: '', phone: '' })
const addressErrors = ref<Record<string, string>>({})
const cartRegion = computed(() => regions.value.find((r) => r.id === cart.value?.regionId))
const countries = computed(() => regions.value.flatMap((r) => r.countries.map((c) => ({ ...c, regionId: r.id }))).sort((a, b) => a.name.localeCompare(b.name)))
const regionForCountry = (iso: string): StoreRegion | undefined => regions.value.find((r) => r.countries.some((c) => c.iso2 === iso))
async function saveAddress() {
  const required = { firstName: 'First name', address1: 'Address', city: 'City', countryCode: 'Country', phone: 'Phone' } as const
  addressErrors.value = Object.fromEntries(Object.entries(required).filter(([k]) => !String(address[k as keyof typeof address]).trim()).map(([k, label]) => [k, `${label} is required`]))
  if (Object.keys(addressErrors.value).length) return
  const target = regionForCountry(address.countryCode)
  const body: Record<string, unknown> = { shippingAddress: { ...address }, billingAddress: { ...address } }
  if (target && target.id !== cart.value?.regionId) {
    body.regionId = target.id
    setRegion(target.id)
  }
  await cartStore.updateCart(body)
  session.value = null
  editing.value = null
  await loadShippingOptions()
}

// ── Delivery ───────────────────────────────────────────────────────────
const shippingOptions = ref<ShippingOption[]>([])
const selectedOption = ref('')
async function loadShippingOptions() {
  if (!cart.value) return
  const res = await storeFetch<{ data: ShippingOption[] }>(`/api/store/carts/${cart.value.id}/shipping-options`)
  shippingOptions.value = res.data
  selectedOption.value = cart.value.shippingMethods[0]?.shippingOptionId ?? res.data[0]?.id ?? ''
}
async function saveDelivery() {
  if (!selectedOption.value || !cart.value) return
  await cartStore.run(() => storeFetch(`/api/store/carts/${cart.value!.id}/shipping-methods`, { method: 'POST', body: { optionId: selectedOption.value } }))
  session.value = null
  editing.value = null
}

// ── Payment ────────────────────────────────────────────────────────────
const PROVIDERS: Record<string, { title: string; hint: string }> = {
  paystack: { title: 'Card or bank', hint: 'Visa, Mastercard and bank transfer via Paystack' },
  'paystack-momo': { title: 'Mobile money', hint: 'MTN MoMo, Telecel Cash and AirtelTigo Money via Paystack' },
  stripe: { title: 'Card', hint: 'Visa, Mastercard, Amex and Apple Pay via Stripe' },
  manual: { title: 'Cash on delivery', hint: 'Pay the courier when your order arrives' },
}
const availableProviders = computed(() => cartRegion.value?.paymentProviders ?? [])
const providerId = ref('')
watch(availableProviders, (p) => {
  if (!p.includes(providerId.value)) providerId.value = p[0] ?? ''
}, { immediate: true })
const paymentError = ref('')
const preparing = ref(false)
const stripeMount = ref<HTMLElement | null>(null)
let stripe: StripeLike | null = null
let stripeElements: ReturnType<StripeLike['elements']> | null = null
let stripeElement: { mount(el: HTMLElement): void; destroy(): void } | null = null

async function savePayment() {
  if (!cart.value || !providerId.value) return
  paymentError.value = ''
  preparing.value = true
  try {
    const res = await storeFetch<{ session: Session }>(`/api/store/carts/${cart.value.id}/payment-sessions`, { method: 'POST', body: { providerId: providerId.value } })
    session.value = res.session
    editing.value = null
    if (res.session.providerId === 'stripe') await mountStripe(res.session)
  } catch (err) {
    paymentError.value = apiErrorMessage(err, 'Could not start payment')
  } finally {
    preparing.value = false
  }
}

async function mountStripe(s: Session) {
  const key = configValue(config.public.stripePublishableKey)
  if (!key || !s.data.clientSecret) throw new Error('Stripe is not configured')
  await loadScript('https://js.stripe.com/v3/')
  stripe = window.Stripe!(key)
  stripeElements = stripe.elements({ clientSecret: s.data.clientSecret, appearance: { theme: 'flat', variables: { borderRadius: '4px', fontFamily: 'Inter, system-ui, sans-serif' } } })
  await nextTick()
  stripeElement?.destroy()
  stripeElement = stripeElements.create('payment')
  if (stripeMount.value) stripeElement.mount(stripeMount.value)
}

// ── Place order ────────────────────────────────────────────────────────
const placing = ref(false)
let idempotencyKey = ''

async function complete(): Promise<void> {
  if (!cart.value) return
  idempotencyKey ||= crypto.randomUUID()
  try {
    const res = await storeFetch<{ order: { id: string; email: string } }>(`/api/store/carts/${cart.value.id}/complete`, { method: 'POST', headers: { 'idempotency-key': idempotencyKey } })
    const { id, email: orderEmail } = res.order
    sessionStorage.setItem('kola_last_order', JSON.stringify({ id, email: orderEmail }))
    cartStore.clear()
    await navigateTo({ path: `/order/confirmed/${id}`, query: { email: orderEmail } })
  } catch (err) {
    idempotencyKey = ''
    const code = apiErrorCode(err)
    if (code === 'payment_session_stale') {
      session.value = null
      paymentError.value = 'Your cart changed. Please confirm your payment method again.'
    } else if (code === 'payment_required') {
      paymentError.value = 'Payment was not completed. Please try again.'
    } else {
      paymentError.value = apiErrorMessage(err, 'We could not place your order')
      await cartStore.load()
    }
  }
}

async function placeOrder() {
  if (!session.value) return
  placing.value = true
  paymentError.value = ''
  try {
    const s = session.value
    if (s.providerId === 'stripe') {
      if (!stripe || !stripeElements) throw new Error('Payment form is not ready')
      const { error } = await stripe.confirmPayment({ elements: stripeElements, redirect: 'if_required', confirmParams: { return_url: `${window.location.origin}/checkout` } })
      if (error) throw new Error(error.message ?? 'Card payment failed')
      await complete()
    } else if (s.providerId.startsWith('paystack')) {
      await loadScript('https://js.paystack.co/v2/inline.js')
      await new Promise<void>((resolve, reject) => {
        new window.PaystackPop!().resumeTransaction(s.data.accessCode!, {
          onSuccess: () => resolve(),
          onCancel: () => reject(new Error('Payment was cancelled')),
          onError: (e) => reject(new Error(e.message)),
        })
      })
      await complete()
    } else {
      await complete()
    }
  } catch (err) {
    paymentError.value = err instanceof Error ? err.message : 'Payment failed'
  } finally {
    placing.value = false
  }
}

onBeforeUnmount(() => stripeElement?.destroy())

const m = (n: number) => formatMoney(n, cart.value?.currencyCode ?? 'GHS')
const addressSummary = computed(() => {
  const a = cart.value?.shippingAddress
  return a ? [`${a.firstName ?? ''} ${a.lastName ?? ''}`.trim(), a.address1, a.city, a.countryCode ? countryName(a.countryCode) : ''].filter(Boolean).join(', ') : ''
})
const deliverySummary = computed(() => cart.value?.shippingMethods.map((s) => `${s.name} · ${s.amount ? m(s.amount) : 'Free'}`).join(', ') ?? '')
const placeLabel = computed(() => {
  if (!cart.value) return 'Place order'
  if (session.value?.providerId === 'manual') return `Place order · ${m(cart.value.totals.total)}`
  return `Pay ${m(cart.value.totals.total)}`
})
watch(
  () => cartStore.error,
  (e) => e && toast.error(e),
)
</script>

<template>
  <div class="checkout">
    <h1 class="section-heading">Checkout</h1>
    <p v-if="!loaded" class="meta">Loading…</p>
    <div v-else-if="!cart || !cart.items.length" class="stack">
      <p>Your cart is empty.</p>
      <div><UiButton variant="primary" to="/shop">Shop now</UiButton></div>
    </div>
    <div v-else class="checkout__grid">
      <div class="steps">
        <StoreCheckoutStep :number="1" title="Contact" :state="stateOf('contact')" :summary="cart.email ?? ''" @edit="editing = 'contact'">
          <form class="stack" style="--stack-gap: 12px" novalidate @submit.prevent="saveContact">
            <UiInput v-model="email" label="Email" type="email" autocomplete="email" required :error="emailError || undefined" hint="We'll send your receipt and delivery updates here" />
            <p v-if="!customer" class="meta">Have an account? <NuxtLink :to="{ path: '/account/login', query: { redirect: '/checkout' } }">Sign in</NuxtLink> for faster checkout.</p>
            <div><UiButton type="submit" variant="primary" :loading="cartStore.busy">Continue</UiButton></div>
          </form>
        </StoreCheckoutStep>

        <StoreCheckoutStep :number="2" title="Shipping address" :state="stateOf('address')" :summary="addressSummary" @edit="editing = 'address'">
          <form class="stack" style="--stack-gap: 12px" novalidate @submit.prevent="saveAddress">
            <div class="form-grid">
              <UiInput v-model="address.firstName" label="First name" autocomplete="given-name" required :error="addressErrors.firstName" />
              <UiInput v-model="address.lastName" label="Last name" autocomplete="family-name" />
            </div>
            <UiInput v-model="address.address1" label="Address" autocomplete="address-line1" required :error="addressErrors.address1" />
            <UiInput v-model="address.address2" label="Apartment, landmark (optional)" autocomplete="address-line2" />
            <div class="form-grid">
              <UiInput v-model="address.city" label="City" autocomplete="address-level2" required :error="addressErrors.city" />
              <UiInput v-model="address.province" label="Region / state" autocomplete="address-level1" />
              <UiInput v-model="address.postalCode" label="Postal code" autocomplete="postal-code" />
              <UiSelect v-model="address.countryCode" label="Country" :options="countries.map((c) => ({ value: c.iso2, label: c.name }))" required />
            </div>
            <UiInput v-model="address.phone" label="Phone" type="tel" autocomplete="tel" required :error="addressErrors.phone" hint="For the courier" />
            <p v-if="address.countryCode && regionForCountry(address.countryCode) && regionForCountry(address.countryCode)!.id !== cart.regionId" class="meta">
              Prices will switch to {{ regionForCountry(address.countryCode)!.currencyCode }} for {{ countryName(address.countryCode) }}.
            </p>
            <div><UiButton type="submit" variant="primary" :loading="cartStore.busy">Continue</UiButton></div>
          </form>
        </StoreCheckoutStep>

        <StoreCheckoutStep :number="3" title="Delivery" :state="stateOf('delivery')" :summary="deliverySummary" @edit="editing = 'delivery'">
          <form class="stack" style="--stack-gap: 12px" @submit.prevent="saveDelivery">
            <fieldset v-if="shippingOptions.length" class="choices">
              <legend class="sr-only">Delivery method</legend>
              <label v-for="o in shippingOptions" :key="o.id" class="choice" :class="{ 'is-selected': selectedOption === o.id }">
                <input v-model="selectedOption" type="radio" name="shipping" :value="o.id">
                <span class="choice__text">
                  <span>{{ o.name }}</span>
                  <span v-if="o.description" class="meta">{{ o.description }}</span>
                </span>
                <span class="num">{{ o.amount ? formatMoney(o.amount, o.currencyCode) : 'Free' }}</span>
              </label>
            </fieldset>
            <p v-else class="text-danger">We don't deliver to this address yet. Try another country or contact us.</p>
            <div><UiButton type="submit" variant="primary" :disabled="!selectedOption" :loading="cartStore.busy">Continue</UiButton></div>
          </form>
        </StoreCheckoutStep>

        <StoreCheckoutStep :number="4" title="Payment" :state="stateOf('payment')" :summary="session ? PROVIDERS[session.providerId]?.title : ''" @edit="editing = 'payment'">
          <form class="stack" style="--stack-gap: 12px" @submit.prevent="savePayment">
            <fieldset v-if="availableProviders.length" class="choices">
              <legend class="sr-only">Payment method</legend>
              <label v-for="p in availableProviders" :key="p" class="choice" :class="{ 'is-selected': providerId === p }">
                <input v-model="providerId" type="radio" name="provider" :value="p">
                <span class="choice__text">
                  <span>{{ PROVIDERS[p]?.title ?? p }}</span>
                  <span class="meta">{{ PROVIDERS[p]?.hint }}</span>
                </span>
              </label>
            </fieldset>
            <p v-else class="text-danger">No payment methods are available for this region.</p>
            <p v-if="paymentError" class="text-danger" role="alert">{{ paymentError }}</p>
            <div><UiButton type="submit" variant="primary" :disabled="!providerId" :loading="preparing">Continue</UiButton></div>
          </form>
        </StoreCheckoutStep>

        <StoreCheckoutStep :number="5" title="Review" :state="stateOf('review')">
          <div class="stack" style="--stack-gap: 16px">
            <div v-show="session?.providerId === 'stripe'" ref="stripeMount" class="stripe-mount" />
            <p v-if="session?.providerId === 'manual'" class="muted">You'll pay {{ m(cart.totals.total) }} in cash when your order arrives. We'll call {{ cart.shippingAddress?.phone }} to confirm.</p>
            <p v-else-if="session?.providerId?.startsWith('paystack')" class="muted">A secure Paystack window will open to complete your payment.</p>
            <p v-if="paymentError" class="text-danger" role="alert">{{ paymentError }}</p>
            <UiButton variant="primary" block :loading="placing" @click="placeOrder">{{ placeLabel }}</UiButton>
            <p class="meta">By placing your order you agree to our <NuxtLink to="/about#terms">terms</NuxtLink>.</p>
          </div>
        </StoreCheckoutStep>
      </div>

      <aside class="summary" aria-label="Order summary">
        <h2 class="lead">Order summary</h2>
        <ul class="sum-items">
          <li v-for="i in cart.items" :key="i.id">
            <div class="sum-thumb">
              <StoreImage :src="i.thumbnail" :alt="i.title" :seed="i.productHandle ?? i.title" ratio="1" sizes="56px" />
              <span class="sum-qty num">{{ i.quantity }}</span>
            </div>
            <div class="sum-text">
              <span>{{ i.title }}</span>
              <span class="meta">{{ i.variantTitle }}</span>
            </div>
            <span class="num">{{ m(i.total) }}</span>
          </li>
        </ul>
        <StoreCartTotals show-shipping />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.checkout {
  padding-top: 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.checkout__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr);
  gap: 48px;
  align-items: start;
}
.steps {
  border-top: 1px solid var(--rule);
}
.choices {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.choice {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
  cursor: pointer;
  min-height: 44px;
}
.choice.is-selected {
  border-color: var(--ink);
}
.choice input {
  accent-color: var(--ink);
}
.choice__text {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.stripe-mount {
  padding: 4px 0;
}
.summary {
  background: var(--putty);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 84px;
}
.sum-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sum-items li {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  gap: 12px;
  align-items: center;
  font-size: var(--fs-ui);
}
.sum-thumb {
  position: relative;
}
.sum-qty {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--control);
  border: 1px solid var(--rule);
  font-size: 11px;
  display: grid;
  place-items: center;
}
.sum-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
@media (max-width: 900px) {
  .checkout__grid {
    grid-template-columns: 1fr;
  }
  .summary {
    position: static;
    order: -1;
  }
}
</style>
