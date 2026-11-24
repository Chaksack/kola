<script setup lang="ts">
import type { SelectOption } from '~/components/ui/Select.vue'
import { productInputSchema, toHandle, type ProductInput } from '#shared/schemas/catalog'
import { fromMinor, toMinor } from '#shared/utils/money'

/** Shape returned by GET /api/admin/products/:id (only what the editor reads). */
export interface EditableProduct {
  id: string
  title: string
  subtitle: string | null
  handle: string
  description: string | null
  status: 'draft' | 'proposed' | 'published' | 'rejected'
  thumbnail: string | null
  isGiftcard: boolean
  discountable: boolean
  weight: number | null
  length: number | null
  height: number | null
  width: number | null
  material: string | null
  originCountry: string | null
  hsCode: string | null
  typeId: string | null
  collectionId: string | null
  seoTitle: string | null
  seoDescription: string | null
  categoryIds: string[]
  tags: string[]
  salesChannelIds: string[]
  images: { url: string; alt: string | null }[]
  options: { title: string; values: string[] }[]
  variants: {
    id: string
    title: string
    sku: string | null
    barcode: string | null
    manageInventory: boolean
    allowBackorder: boolean
    options: Record<string, string>
    prices: { amount: number; currencyCode: string; regionId: string | null }[]
    inventory: { locationId: string; stocked: number; reserved: number }[]
  }[]
}

const props = defineProps<{ product?: EditableProduct | null }>()
const emit = defineEmits<{ saved: [id: string]; deleted: [] }>()

const toast = useToast()
const { can } = useAdmin()

// ── Reference data ──────────────────────────────────────────────────────
interface Currency { code: string; symbol: string; isDefault: boolean }
interface Region { id: string; name: string; currencyCode: string }
interface Location { id: string; name: string }
interface Channel { id: string; name: string; isDisabled: boolean }
interface Category { id: string; name: string; parentId: string | null; rank: number }

const opts = { server: false } as const
const [{ data: storeData }, { data: regions }, { data: locations }, { data: channels }, { data: collections }, { data: categories }, { data: types }] = await Promise.all([
  useFetch<{ store: { currencies: Currency[] } }>('/api/admin/store', opts),
  useFetch<{ data: Region[] }>('/api/admin/regions', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: Location[] }>('/api/admin/stock-locations', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: Channel[] }>('/api/admin/sales-channels', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; title: string }[] }>('/api/admin/collections', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: Category[] }>('/api/admin/categories', { ...opts, default: () => ({ data: [] }) }),
  useFetch<{ data: { id: string; value: string }[] }>('/api/admin/product-types', { ...opts, default: () => ({ data: [] }) }),
])
const currencies = computed(() => storeData.value?.store.currencies ?? [])

/** Categories flattened depth-first so the list reads as a tree. */
const categoryTree = computed(() => {
  const out: (Category & { depth: number })[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of categories.value.data.filter((x) => x.parentId === parent)) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

// ── Form state ──────────────────────────────────────────────────────────
interface OptionForm { title: string; valuesText: string }
interface VariantForm {
  key: string
  id?: string
  options: Record<string, string>
  title: string
  sku: string
  barcode: string
  manageInventory: boolean
  allowBackorder: boolean
  /** price column key → major-unit string */
  prices: Record<string, string>
  stock: Record<string, number>
  reserved: Record<string, number>
}

const p = props.product
const form = reactive({
  title: p?.title ?? '',
  subtitle: p?.subtitle ?? '',
  handle: p?.handle ?? '',
  description: p?.description ?? '',
  status: p?.status ?? 'draft',
  isGiftcard: p?.isGiftcard ?? false,
  discountable: p?.discountable ?? true,
  weight: (p?.weight ?? null) as string | number | null,
  length: (p?.length ?? null) as string | number | null,
  height: (p?.height ?? null) as string | number | null,
  width: (p?.width ?? null) as string | number | null,
  material: p?.material ?? '',
  originCountry: p?.originCountry ?? '',
  hsCode: p?.hsCode ?? '',
  typeId: p?.typeId ?? '',
  collectionId: p?.collectionId ?? '',
  seoTitle: p?.seoTitle ?? '',
  seoDescription: p?.seoDescription ?? '',
  categoryIds: [...(p?.categoryIds ?? [])],
  tagsText: (p?.tags ?? []).join(', '),
  salesChannelIds: [...(p?.salesChannelIds ?? [])],
  images: (p?.images ?? []).map((i) => ({ url: i.url, alt: i.alt ?? '' })),
})
const handleTouched = ref(Boolean(p))
watch(
  () => form.title,
  (t) => {
    if (!handleTouched.value) form.handle = toHandle(t)
  },
)

const options = ref<OptionForm[]>((p?.options ?? []).map((o) => ({ title: o.title, valuesText: o.values.join(', ') })))
const parsedOptions = computed(() =>
  options.value
    .map((o) => ({ title: o.title.trim(), values: [...new Set(o.valuesText.split(',').map((v) => v.trim()).filter(Boolean))] }))
    .filter((o) => o.title && o.values.length),
)

const showRegionPrices = ref(Boolean(p?.variants.some((v) => v.prices.some((x) => x.regionId))))
const priceColumns = computed(() => [
  ...currencies.value.map((c) => ({ key: c.code, label: c.code, currencyCode: c.code, regionId: null as string | null })),
  ...(showRegionPrices.value ? regions.value.data.map((r) => ({ key: `${r.currencyCode}:${r.id}`, label: `${r.name} (${r.currencyCode})`, currencyCode: r.currencyCode, regionId: r.id as string | null })) : []),
])

const comboKey = (o: Record<string, string>, opts = parsedOptions.value) => opts.map((x) => o[x.title] ?? '').join('\u0000')
let seq = 0
function blankVariant(o: Record<string, string>): VariantForm {
  return { key: `new-${++seq}`, options: o, title: '', sku: '', barcode: '', manageInventory: !form.isGiftcard, allowBackorder: false, prices: {}, stock: {}, reserved: {} }
}
const variants = ref<VariantForm[]>(
  (p?.variants ?? []).map((v) => ({
    key: v.id,
    id: v.id,
    options: { ...v.options },
    title: v.title,
    sku: v.sku ?? '',
    barcode: v.barcode ?? '',
    manageInventory: v.manageInventory,
    allowBackorder: v.allowBackorder,
    prices: Object.fromEntries(v.prices.map((x) => [x.regionId ? `${x.currencyCode}:${x.regionId}` : x.currencyCode, fromMinor(x.amount, x.currencyCode)])),
    stock: Object.fromEntries(v.inventory.map((l) => [l.locationId, l.stocked])),
    reserved: Object.fromEntries(v.inventory.map((l) => [l.locationId, l.reserved])),
  })),
)
if (!variants.value.length) variants.value = [blankVariant({})]

/** Rebuild the variant list from the option matrix, keeping variants whose combination still exists. */
watch(
  parsedOptions,
  (opts, prev) => {
    const combos = opts.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((c) => o.values.map((v) => ({ ...c, [o.title]: v }))), [{}])
    const byKey = new Map(variants.value.map((v) => [comboKey(v.options, prev ?? opts), v]))
    const renamed = prev && prev.length === opts.length ? prev.map((o, i) => [o.title, opts[i]!.title] as const) : []
    variants.value = combos.map((c) => {
      // Carry values across option renames by translating the previous key.
      const prevOpts = Object.fromEntries(renamed.map(([from, to]) => [from, c[to] ?? '']))
      const existing = byKey.get(comboKey(c, opts)) ?? (renamed.length ? byKey.get(comboKey(prevOpts, prev)) : undefined)
      return existing ? { ...existing, options: c, title: '' } : blankVariant(c)
    })
  },
  { deep: true },
)

const variantLabel = (v: VariantForm) => parsedOptions.value.map((o) => v.options[o.title]).join(' / ') || 'Default'

function addOption() {
  options.value.push({ title: '', valuesText: '' })
}
function removeOption(i: number) {
  options.value.splice(i, 1)
}
function toggle(list: string[], id: string, on: boolean) {
  const i = list.indexOf(id)
  if (on && i < 0) list.push(id)
  if (!on && i >= 0) list.splice(i, 1)
}
function fillPrice(col: string) {
  const first = variants.value.find((v) => v.prices[col])?.prices[col]
  if (first) for (const v of variants.value) v.prices[col] = v.prices[col] || first
}

// ── Media ───────────────────────────────────────────────────────────────
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  const body = new FormData()
  for (const f of files) body.append('files', f)
  uploading.value = true
  try {
    const res = await $fetch<{ files: { url: string }[] }>('/api/admin/uploads', { method: 'POST', body })
    form.images.push(...res.files.map((f) => ({ url: f.url, alt: form.title })))
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Upload failed'))
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
function moveToFront(i: number) {
  const [img] = form.images.splice(i, 1)
  if (img) form.images.unshift(img)
}

// ── Save ────────────────────────────────────────────────────────────────
const errors = ref<Record<string, string>>({})
const saving = ref(false)

function buildPayload(): ProductInput {
  return {
    title: form.title,
    subtitle: form.subtitle || null,
    handle: form.handle || undefined,
    description: form.description || null,
    status: form.status,
    isGiftcard: form.isGiftcard,
    discountable: form.discountable,
    weight: form.weight ? Number(form.weight) : null,
    length: form.length ? Number(form.length) : null,
    height: form.height ? Number(form.height) : null,
    width: form.width ? Number(form.width) : null,
    material: form.material || null,
    originCountry: form.originCountry || null,
    hsCode: form.hsCode || null,
    typeId: form.typeId || null,
    collectionId: form.collectionId || null,
    seoTitle: form.seoTitle || null,
    seoDescription: form.seoDescription || null,
    categoryIds: form.categoryIds,
    tags: form.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    salesChannelIds: form.salesChannelIds,
    images: form.images.map((i) => ({ url: i.url, alt: i.alt || null })),
    thumbnail: form.images[0]?.url ?? null,
    options: parsedOptions.value,
    variants: variants.value.map((v) => ({
      id: v.id,
      sku: v.sku || null,
      barcode: v.barcode || null,
      manageInventory: v.manageInventory,
      allowBackorder: v.allowBackorder,
      options: v.options,
      prices: priceColumns.value
        .filter((c) => v.prices[c.key]?.trim())
        .map((c) => ({ amount: toMinor(v.prices[c.key]!, c.currencyCode), currencyCode: c.currencyCode, regionId: c.regionId })),
      inventory: v.manageInventory ? (locations.value.data ?? []).map((l) => ({ locationId: l.id, stocked: Math.max(0, Math.floor(Number(v.stock[l.id] ?? 0))) })) : undefined,
    })),
  }
}

async function save() {
  errors.value = {}
  let payload: ProductInput
  try {
    payload = buildPayload()
  } catch (err) {
    errors.value = { variants: err instanceof Error ? err.message : 'Check the prices' }
    return
  }
  const parsed = productInputSchema.safeParse(payload)
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors.value[String(i.path[0])] ??= i.message
    toast.error('Check the highlighted fields')
    return
  }
  saving.value = true
  try {
    const url = p ? `/api/admin/products/${p.id}` : '/api/admin/products'
    const res = await $fetch<{ product: { id: string } }>(url, { method: 'POST', body: payload })
    toast.success(p ? 'Product saved' : 'Product created')
    emit('saved', res.product.id)
  } catch (err) {
    errors.value = apiFieldErrors(err)
    toast.error(apiErrorMessage(err, 'Could not save the product'))
  } finally {
    saving.value = false
  }
}

const deleteOpen = ref(false)
async function remove() {
  if (!p) return
  try {
    await $fetch(`/api/admin/products/${p.id}` as string, { method: 'DELETE' })
    toast.success('Product deleted')
    emit('deleted')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}

const statusOptions: SelectOption[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
]
const collectionOptions = computed<SelectOption[]>(() => [{ value: '', label: 'No collection' }, ...collections.value.data.map((c) => ({ value: c.id, label: c.title }))])
const typeOptions = computed<SelectOption[]>(() => [{ value: '', label: 'No type' }, ...types.value.data.map((t) => ({ value: t.id, label: t.value }))])

</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :back="{ label: 'Products', to: '/admin/products' }" :title="p ? p.title : 'New product'" :search="false">
      <template #meta>
        <div v-if="p" class="row" style="margin-top: 6px">
          <UiStatusBadge :status="form.status" />
          <span class="mono meta">{{ p.id }}</span>
        </div>
      </template>
      <template #actions>
        <UiMenu v-if="p && can('admin')" :items="[{ label: 'Delete product', value: 'delete', danger: true }]" label="More product actions" align="right" @select="deleteOpen = true" />
        <UiButton to="/admin/products">Cancel</UiButton>
        <UiButton variant="primary" :loading="saving" @click="save">{{ p ? 'Save' : 'Create product' }}</UiButton>
      </template>
    </AdminPageHeader>

    <form class="detail-grid" novalidate @submit.prevent="save">
      <div class="detail-main">
        <UiCard title="General">
          <div class="stack" style="--stack-gap: 14px">
            <UiInput v-model="form.title" label="Title" required :error="errors.title" placeholder="Kente Weave Tote" />
            <div class="form-grid">
              <UiInput v-model="form.subtitle" label="Subtitle" placeholder="Handwoven in Bonwire" />
              <UiInput v-model="form.handle" label="Handle" mono :error="errors.handle" hint="Used in the product URL" @update:model-value="handleTouched = true" />
            </div>
            <UiTextarea v-model="form.description" label="Description" :rows="6" />
          </div>
        </UiCard>

        <UiCard title="Media">
          <template #actions>
            <UiButton size="sm" :loading="uploading" @click="fileInput?.click()">Upload images</UiButton>
          </template>
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple class="sr-only" aria-label="Upload images" @change="onFiles">
          <div v-if="form.images.length" class="media-grid">
            <figure v-for="(img, i) in form.images" :key="img.url + i" class="media-item">
              <UiThumb :src="img.url" :alt="img.alt" :size="112" />
              <figcaption class="stack" style="--stack-gap: 6px">
                <UiInput v-model="img.alt" :label="`Alt text for image ${i + 1}`" hide-label placeholder="Alt text" />
                <div class="row" style="--row-gap: 4px">
                  <span v-if="i === 0" class="meta">Thumbnail</span>
                  <UiButton v-else size="sm" variant="ghost" @click="moveToFront(i)">Make thumbnail</UiButton>
                  <UiButton size="sm" variant="ghost" :aria-label="`Remove image ${i + 1}`" @click="form.images.splice(i, 1)">Remove</UiButton>
                </div>
              </figcaption>
            </figure>
          </div>
          <p v-else class="meta">JPEG, PNG, WebP, AVIF or GIF up to 5MB. The first image is the thumbnail.</p>
        </UiCard>

        <UiCard title="Options">
          <template #actions>
            <UiButton size="sm" variant="dashed" :disabled="options.length >= 5" @click="addOption">+ Add option</UiButton>
          </template>
          <div v-if="options.length" class="stack" style="--stack-gap: 10px">
            <div v-for="(o, i) in options" :key="i" class="option-row">
              <UiInput v-model="o.title" :label="i === 0 ? 'Option' : undefined" :hide-label="i > 0" placeholder="Size" />
              <UiInput v-model="o.valuesText" :label="i === 0 ? 'Values (comma separated)' : undefined" :hide-label="i > 0" placeholder="S, M, L" />
              <UiButton variant="ghost" size="sm" icon :aria-label="`Remove option ${o.title || i + 1}`" class="option-row__remove" @click="removeOption(i)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </UiButton>
            </div>
            <p v-if="errors.options" class="text-danger meta">{{ errors.options }}</p>
          </div>
          <p v-else class="meta">This product has a single variant. Add options such as Size or Colour to sell variations.</p>
        </UiCard>

        <UiCard flush :title="`Variants and prices (${variants.length})`">
          <template #actions>
            <UiCheckbox v-model="showRegionPrices" label="Region price overrides" />
          </template>
          <div class="matrix-wrap">
            <table class="matrix">
              <caption class="sr-only">Variants, SKUs and prices</caption>
              <thead>
                <tr>
                  <th scope="col">Variant</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Track stock</th>
                  <th v-for="c in priceColumns" :key="c.key" scope="col" class="num">
                    <button type="button" class="col-fill" :title="`Copy the first ${c.label} price to empty rows`" @click="fillPrice(c.key)">{{ c.label }}</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in variants" :key="v.key">
                  <th scope="row">{{ variantLabel(v) }}</th>
                  <td><input v-model="v.sku" class="cell-input mono" :aria-label="`SKU for ${variantLabel(v)}`" placeholder="SKU"></td>
                  <td><input v-model="v.manageInventory" type="checkbox" :aria-label="`Track stock for ${variantLabel(v)}`"></td>
                  <td v-for="c in priceColumns" :key="c.key">
                    <input v-model="v.prices[c.key]" class="cell-input num" inputmode="decimal" :aria-label="`${c.label} price for ${variantLabel(v)}`" placeholder="0.00">
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="errors.variants" class="text-danger meta matrix-error">{{ errors.variants }}</p>
          <template #footer>
            <p class="meta">Prices are in major units and include tax for tax-inclusive regions. Click a currency heading to copy its first price down.</p>
          </template>
        </UiCard>

        <UiCard v-if="variants.some((v) => v.manageInventory)" flush title="Inventory">
          <div class="matrix-wrap">
            <table class="matrix">
              <caption class="sr-only">Stock per location</caption>
              <thead>
                <tr>
                  <th scope="col">Variant</th>
                  <th v-for="l in locations.data" :key="l.id" scope="col" class="num">{{ l.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in variants.filter((x) => x.manageInventory)" :key="v.key">
                  <th scope="row">{{ variantLabel(v) }}</th>
                  <td v-for="l in locations.data" :key="l.id">
                    <div class="stock-cell">
                      <input v-model.number="v.stock[l.id]" type="number" min="0" class="cell-input num" :aria-label="`Stock of ${variantLabel(v)} at ${l.name}`" placeholder="0">
                      <span v-if="v.reserved[l.id]" class="meta num">{{ v.reserved[l.id] }} reserved</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiCard>

        <UiCard title="Search engine listing">
          <div class="stack" style="--stack-gap: 14px">
            <div class="seo-preview">
              <span class="seo-preview__title">{{ form.seoTitle || form.title || 'Product title' }}</span>
              <span class="mono meta">/products/{{ form.handle || 'handle' }}</span>
              <span class="meta">{{ form.seoDescription || form.subtitle || 'Add a description for search results.' }}</span>
            </div>
            <UiInput v-model="form.seoTitle" label="Page title" />
            <UiTextarea v-model="form.seoDescription" label="Meta description" :rows="2" />
          </div>
        </UiCard>
      </div>

      <aside class="detail-side">
        <UiCard title="Status">
          <UiSelect v-model="form.status" label="Status" hide-label :options="statusOptions" />
        </UiCard>

        <UiCard title="Sales channels">
          <div class="stack" style="--stack-gap: 8px">
            <UiCheckbox
              v-for="c in channels.data"
              :key="c.id"
              :model-value="form.salesChannelIds.includes(c.id)"
              :label="c.name"
              :hint="c.isDisabled ? 'Disabled' : undefined"
              @update:model-value="toggle(form.salesChannelIds, c.id, Boolean($event))"
            />
          </div>
        </UiCard>

        <UiCard title="Organize">
          <div class="stack" style="--stack-gap: 14px">
            <UiSelect v-model="form.collectionId" label="Collection" :options="collectionOptions" />
            <UiSelect v-model="form.typeId" label="Type" :options="typeOptions" />
            <UiInput v-model="form.tagsText" label="Tags" hint="Comma separated" placeholder="handmade, kente" />
            <fieldset class="fieldset">
              <legend class="field-label">Categories</legend>
              <div class="category-list">
                <UiCheckbox
                  v-for="c in categoryTree"
                  :key="c.id"
                  :style="{ paddingLeft: `${c.depth * 16}px` }"
                  :model-value="form.categoryIds.includes(c.id)"
                  :label="c.name"
                  @update:model-value="toggle(form.categoryIds, c.id, Boolean($event))"
                />
                <p v-if="!categoryTree.length" class="meta">No categories yet.</p>
              </div>
            </fieldset>
          </div>
        </UiCard>

        <UiCard title="Attributes">
          <div class="stack" style="--stack-gap: 12px">
            <UiCheckbox v-model="form.isGiftcard" label="Gift card" hint="Not shipped, never discounted" />
            <UiCheckbox v-model="form.discountable" label="Discountable" />
            <div class="form-grid">
              <UiInput v-model="form.weight" label="Weight (g)" type="number" min="0" inputmode="numeric" />
              <UiInput v-model="form.material" label="Material" />
              <UiInput v-model="form.originCountry" label="Origin (ISO-2)" mono placeholder="gh" />
              <UiInput v-model="form.hsCode" label="HS code" mono />
            </div>
          </div>
        </UiCard>
      </aside>
    </form>

    <UiDialog v-model:open="deleteOpen" title="Delete product" :description="`${p?.title} will be removed from every sales channel. Past orders keep their line items.`">
      <template #footer>
        <UiButton @click="deleteOpen = false">Cancel</UiButton>
        <UiButton variant="danger" @click="remove">Delete</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--gutter);
}
.media-item {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.media-item :deep(.ui-thumb) {
  width: 100% !important;
  aspect-ratio: 1;
  height: auto !important;
}
.option-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(160px, 2fr) auto;
  gap: 8px;
  align-items: end;
}
.option-row__remove {
  margin-bottom: 2px;
}
.matrix-wrap {
  overflow-x: auto;
}
.matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-ui);
}
.matrix th,
.matrix td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  white-space: nowrap;
}
.matrix thead th {
  font-size: var(--fs-meta);
  font-weight: 500;
  color: var(--ink-3);
}
.matrix tbody th {
  font-weight: 400;
}
.matrix tbody tr:last-child > * {
  border-bottom: 0;
}
.cell-input {
  width: 100%;
  min-width: 84px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
  font-size: var(--fs-ui);
}
.cell-input.num {
  text-align: right;
}
.col-fill {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.stock-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stock-cell .cell-input {
  max-width: 96px;
}
.matrix-error {
  padding: 8px 16px;
}
.seo-preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  background: var(--putty-inset);
  border-radius: var(--radius);
}
.seo-preview__title {
  font-size: 16px;
  color: var(--ink);
}
.fieldset {
  border: 0;
  padding: 0;
  margin: 0;
}
.fieldset legend {
  margin-bottom: 8px;
}
.category-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}
</style>
