<script setup lang="ts">
import type { SelectOption } from '~/components/ui/Select.vue'
import { promotionInputSchema } from '#shared/schemas/marketing'
import { describePromotion } from '#shared/utils/promotions'
import { formatMoney, fromMinor, toMinor } from '#shared/utils/money'

type Attribute = 'product' | 'collection' | 'category' | 'product_type' | 'customer_group' | 'region' | 'currency' | 'min_subtotal'
export interface EditablePromotion {
  id: string
  code: string
  type: 'standard' | 'buyget'
  isAutomatic: boolean
  status: 'draft' | 'active' | 'inactive'
  campaignId: string | null
  applicationType: 'percentage' | 'fixed'
  value: number
  currencyCode: string | null
  targetType: 'items' | 'shipping' | 'order'
  allocation: 'each' | 'across'
  maxQuantity: number | null
  buyQuantity: number | null
  applyToQuantity: number | null
  stackable: boolean
  usageLimit: number | null
  usageCount: number
  startsAt: string | null
  endsAt: string | null
  rules: { ruleType: 'condition' | 'target' | 'buy'; attribute: Attribute; operator: 'in' | 'eq' | 'gte' | 'lte'; values: string[] }[]
  usage: { orders: number; discount: number }
}

const props = defineProps<{ promotion?: EditablePromotion | null }>()
const emit = defineEmits<{ saved: [id: string] }>()
const toast = useToast()
const { can } = useAdmin()
const p = props.promotion

const opts = { server: false } as const
const [{ data: campaigns }, { data: products }, { data: collections }, { data: categories }, { data: types }, { data: groups }, { data: regions }, { data: storeData }] = await Promise.all([
  useFetch<{ data: { id: string; name: string }[] }>('/api/admin/campaigns', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; title: string }[] }>('/api/admin/products', { ...opts, query: { limit: 200 }, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; title: string }[] }>('/api/admin/collections', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; name: string }[] }>('/api/admin/categories', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; value: string }[] }>('/api/admin/product-types', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; name: string }[] }>('/api/admin/customer-groups', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; name: string; currencyCode: string }[] }>('/api/admin/regions', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ store: { defaultCurrencyCode: string; currencies: { code: string }[] } }>('/api/admin/store', opts),
])
const currencies = computed(() => storeData.value?.store.currencies.map((c) => c.code) ?? ['GHS'])

const form = reactive({
  code: p?.code ?? '',
  type: p?.type ?? 'standard',
  isAutomatic: p?.isAutomatic ?? false,
  status: p?.status ?? 'draft',
  campaignId: p?.campaignId ?? '',
  applicationType: p?.applicationType ?? 'percentage',
  valueText: p ? (p.applicationType === 'percentage' ? String(p.value / 100) : fromMinor(p.value, p.currencyCode ?? 'GHS')) : '10',
  currencyCode: p?.currencyCode ?? storeData.value?.store.defaultCurrencyCode ?? 'GHS',
  targetType: p?.targetType ?? 'order',
  allocation: p?.allocation ?? 'across',
  maxQuantity: p?.maxQuantity ? String(p.maxQuantity) : '',
  buyQuantity: p?.buyQuantity ? String(p.buyQuantity) : '2',
  applyToQuantity: p?.applyToQuantity ? String(p.applyToQuantity) : '1',
  stackable: p?.stackable ?? false,
  usageLimit: p?.usageLimit ? String(p.usageLimit) : '',
  startsAt: p?.startsAt?.slice(0, 10) ?? '',
  endsAt: p?.endsAt?.slice(0, 10) ?? '',
})
const rules = ref((p?.rules ?? []).map((r) => ({ ...r, values: [...r.values], minText: r.attribute === 'min_subtotal' ? fromMinor(Number(r.values[0] ?? 0), storeData.value?.store.defaultCurrencyCode ?? 'GHS') : '' })))

const ATTRS: { value: Attribute; label: string }[] = [
  { value: 'product', label: 'Product' },
  { value: 'collection', label: 'Collection' },
  { value: 'category', label: 'Category' },
  { value: 'product_type', label: 'Product type' },
  { value: 'customer_group', label: 'Customer group' },
  { value: 'region', label: 'Region' },
  { value: 'currency', label: 'Currency' },
  { value: 'min_subtotal', label: 'Minimum subtotal' },
]
function choices(a: Attribute): SelectOption[] {
  switch (a) {
    case 'product':
      return products.value.data.map((x) => ({ value: x.id, label: x.title }))
    case 'collection':
      return collections.value.data.map((x) => ({ value: x.id, label: x.title }))
    case 'category':
      return categories.value.data.map((x) => ({ value: x.id, label: x.name }))
    case 'product_type':
      return types.value.data.map((x) => ({ value: x.id, label: x.value }))
    case 'customer_group':
      return groups.value.data.map((x) => ({ value: x.id, label: x.name }))
    case 'region':
      return regions.value.data.map((x) => ({ value: x.id, label: x.name }))
    case 'currency':
      return currencies.value.map((c) => ({ value: c, label: c }))
    default:
      return []
  }
}
function addRule(ruleType: 'condition' | 'target' | 'buy') {
  rules.value.push({ ruleType, attribute: ruleType === 'condition' ? 'min_subtotal' : 'collection', operator: 'in', values: [], minText: '' })
}
function toggleValue(r: { values: string[] }, v: string, on: boolean) {
  const i = r.values.indexOf(v)
  if (on && i < 0) r.values.push(v)
  if (!on && i >= 0) r.values.splice(i, 1)
}

const errors = ref<Record<string, string>>({})
const saving = ref(false)
function payload() {
  const value = form.applicationType === 'percentage' ? Math.round(Number(form.valueText) * 100) : toMinor(form.valueText || '0', form.currencyCode)
  return {
    code: form.code,
    type: form.type,
    isAutomatic: form.isAutomatic,
    status: form.status,
    campaignId: form.campaignId || null,
    applicationType: form.applicationType,
    value,
    currencyCode: form.applicationType === 'fixed' ? form.currencyCode : null,
    targetType: form.type === 'buyget' ? 'items' : form.targetType,
    allocation: form.allocation,
    maxQuantity: form.maxQuantity ? Number(form.maxQuantity) : null,
    buyQuantity: form.type === 'buyget' ? Number(form.buyQuantity) : null,
    applyToQuantity: form.type === 'buyget' ? Number(form.applyToQuantity) : null,
    stackable: form.stackable,
    usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
    startsAt: form.startsAt || null,
    endsAt: form.endsAt || null,
    rules: rules.value
      .map((r) => ({ ruleType: r.ruleType, attribute: r.attribute, operator: r.attribute === 'min_subtotal' ? 'gte' : 'in', values: r.attribute === 'min_subtotal' ? [String(toMinor(r.minText || '0', storeData.value?.store.defaultCurrencyCode ?? 'GHS'))] : r.values }))
      .filter((r) => r.values.length),
  }
}
const preview = computed(() => {
  try {
    const b = payload()
    return describePromotion({ ...b, currencyCode: b.currencyCode, buyQuantity: b.buyQuantity, applyToQuantity: b.applyToQuantity } as Parameters<typeof describePromotion>[0])
  } catch {
    return ''
  }
})
async function save() {
  errors.value = {}
  let body
  try {
    body = payload()
  } catch {
    errors.value = { value: 'Enter a valid amount' }
    return
  }
  const parsed = promotionInputSchema.safeParse(body)
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors.value[String(i.path[0])] ??= i.message
    return
  }
  saving.value = true
  try {
    const res = await api<{ promotion: { id: string } }>(p ? `/api/admin/promotions/${p.id}` : '/api/admin/promotions', { method: 'POST', body })
    toast.success(p ? 'Promotion saved' : 'Promotion created')
    emit('saved', res.promotion.id)
  } catch (err) {
    errors.value = apiFieldErrors(err)
    toast.error(apiErrorMessage(err))
  } finally {
    saving.value = false
  }
}
async function remove() {
  if (!p) return
  try {
    await api(`/api/admin/promotions/${p.id}`, { method: 'DELETE' })
    toast.success('Promotion deleted')
    await navigateTo('/admin/promotions')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
const ruleTitle = { condition: 'Conditions · the cart must match', target: 'Targets · which items are discounted', buy: 'Buy rules · items that qualify' } as const
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :back="{ label: 'Promotions', to: '/admin/promotions' }" :title="p ? p.code : 'New promotion'" :mono="Boolean(p)" :search="false">
      <template #meta>
        <p v-if="preview" class="meta" style="margin-top: 6px">{{ preview }}</p>
      </template>
      <template #actions>
        <UiMenu v-if="p && can('admin')" :items="[{ label: 'Delete promotion', value: 'delete', danger: true }]" label="More promotion actions" align="right" @select="remove" />
        <UiButton to="/admin/promotions">Cancel</UiButton>
        <UiButton variant="primary" :loading="saving" @click="save">{{ p ? 'Save' : 'Create promotion' }}</UiButton>
      </template>
    </AdminPageHeader>

    <form class="detail-grid" novalidate @submit.prevent="save">
      <div class="detail-main">
        <UiCard title="Discount">
          <div class="stack" style="--stack-gap: 14px">
            <div class="form-grid">
              <UiInput v-model="form.code" label="Code" mono required :error="errors.code" placeholder="HARMATTAN10" hint="Customers type this at checkout" />
              <UiSelect v-model="form.type" label="Type" :options="[{ value: 'standard', label: 'Standard discount' }, { value: 'buyget', label: 'Buy X, get Y' }]" />
            </div>
            <div class="form-grid">
              <UiSelect v-model="form.applicationType" label="Amount type" :options="[{ value: 'percentage', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }]" />
              <UiInput v-model="form.valueText" :label="form.applicationType === 'percentage' ? 'Percentage off' : 'Amount off'" inputmode="decimal" required :error="errors.value">
                <template #suffix>{{ form.applicationType === 'percentage' ? '%' : form.currencyCode }}</template>
              </UiInput>
              <UiSelect v-if="form.applicationType === 'fixed'" v-model="form.currencyCode" label="Currency" :options="currencies.map((c) => ({ value: c, label: c }))" />
            </div>
            <div v-if="form.type === 'standard'" class="form-grid">
              <UiSelect v-model="form.targetType" label="Applies to" :options="[{ value: 'order', label: 'The whole order' }, { value: 'items', label: 'Specific items' }, { value: 'shipping', label: 'Shipping' }]" />
              <UiSelect v-if="form.targetType === 'items'" v-model="form.allocation" label="Allocation" :options="[{ value: 'across', label: 'Split across items' }, { value: 'each', label: 'Each item' }]" />
              <UiInput v-if="form.targetType === 'items' && form.allocation === 'each'" v-model="form.maxQuantity" label="Max units per line" inputmode="numeric" />
            </div>
            <div v-else class="form-grid">
              <UiInput v-model="form.buyQuantity" label="Customer buys" inputmode="numeric" :error="errors.buyQuantity" />
              <UiInput v-model="form.applyToQuantity" label="Customer gets (discounted)" inputmode="numeric" hint="Cheapest eligible items first" />
            </div>
          </div>
        </UiCard>

        <UiCard v-for="kind in (form.type === 'buyget' ? ['condition', 'buy', 'target'] : form.targetType === 'items' ? ['condition', 'target'] : ['condition']) as ('condition' | 'target' | 'buy')[]" :key="kind" :title="ruleTitle[kind]">
          <template #actions>
            <UiButton size="sm" variant="dashed" @click="addRule(kind)">+ Add rule</UiButton>
          </template>
          <div class="stack" style="--stack-gap: 12px">
            <div v-for="(r, idx) in rules" v-show="r.ruleType === kind" :key="idx" class="rule">
              <div class="rule__head">
                <UiSelect v-model="r.attribute" :label="`Rule ${idx + 1} attribute`" hide-label :options="ATTRS.filter((a) => kind === 'condition' || !['customer_group', 'region', 'currency', 'min_subtotal'].includes(a.value))" @update:model-value="r.values = []" />
                <UiButton size="sm" variant="ghost" :aria-label="`Remove rule ${idx + 1}`" @click="rules.splice(idx, 1)">Remove</UiButton>
              </div>
              <UiInput v-if="r.attribute === 'min_subtotal'" v-model="r.minText" label="Minimum item subtotal" inputmode="decimal" hint="In the cart's currency" />
              <div v-else class="rule__values">
                <UiCheckbox v-for="o in choices(r.attribute)" :key="o.value" :model-value="r.values.includes(o.value)" :label="o.label" @update:model-value="toggleValue(r, o.value, Boolean($event))" />
              </div>
            </div>
            <p v-if="!rules.some((r) => r.ruleType === kind)" class="meta">{{ kind === 'condition' ? 'No conditions: any cart qualifies.' : kind === 'target' ? 'No targets: every discountable item is eligible.' : 'No buy rules: any items count.' }}</p>
          </div>
        </UiCard>
      </div>

      <aside class="detail-side">
        <UiCard title="Status">
          <div class="stack" style="--stack-gap: 12px">
            <UiSelect v-model="form.status" label="Status" hide-label :options="[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]" />
            <UiCheckbox v-model="form.isAutomatic" label="Apply automatically" hint="No code needed" />
            <UiCheckbox v-model="form.stackable" label="Combines with other discounts" />
          </div>
        </UiCard>
        <UiCard title="Limits">
          <div class="stack" style="--stack-gap: 12px">
            <UiInput v-model="form.usageLimit" label="Total uses" inputmode="numeric" placeholder="Unlimited" />
            <UiInput v-model="form.startsAt" label="Starts" type="date" />
            <UiInput v-model="form.endsAt" label="Ends" type="date" :error="errors.endsAt" />
            <UiSelect v-model="form.campaignId" label="Campaign" :options="[{ value: '', label: 'No campaign' }, ...campaigns.data.map((c) => ({ value: c.id, label: c.name }))]" />
          </div>
        </UiCard>
        <UiCard v-if="p" title="Performance">
          <dl class="dl">
            <dt>Times used</dt>
            <dd>{{ p.usageCount }}{{ p.usageLimit ? ` / ${p.usageLimit}` : '' }}</dd>
            <dt>Orders</dt>
            <dd>{{ p.usage.orders }}</dd>
            <dt>Discount given</dt>
            <dd>{{ formatMoney(p.usage.discount, storeData?.store.defaultCurrencyCode ?? 'GHS') }}</dd>
          </dl>
        </UiCard>
      </aside>
    </form>
  </div>
</template>

<style scoped>
.rule {
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--paper);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rule__head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}
.rule__values {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}
</style>
