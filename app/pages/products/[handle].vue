<script setup lang="ts">
import type { ProductCardData } from '~/components/store/ProductCard.vue'
import { fromMinor } from '#shared/utils/money'
import { countryName } from '#shared/utils/countries'

interface Variant {
  id: string
  title: string
  sku: string | null
  options: Record<string, string>
  price: { amount: number; originalAmount: number; currencyCode: string } | null
  inStock: boolean
  allowBackorder: boolean
  lowStock: number | null
}
interface Product {
  id: string
  title: string
  subtitle: string | null
  handle: string
  description: string | null
  thumbnail: string | null
  isGiftcard: boolean
  material: string | null
  weight: number | null
  originCountry: string | null
  seoTitle: string | null
  seoDescription: string | null
  images: { url: string; alt: string | null }[]
  collection: { title: string; handle: string } | null
  categories: { name: string; handle: string }[]
  options: { title: string; values: string[] }[]
  variants: Variant[]
  related: ProductCardData[]
}

const route = useRoute()
const handle = computed(() => String(route.params.handle))
const { regionQuery } = useRegion()
const cartStore = useCartStore()
const config = useRuntimeConfig()

const { data, error } = await useStoreFetch<{ product: Product }>(() => `/api/store/products/${handle.value}`, {
  key: `product-${handle.value}`,
  query: computed(() => ({ regionId: regionQuery.value })),
})
if (error.value?.statusCode === 404 || (!data.value && error.value)) throw createError({ statusCode: 404, statusMessage: 'Product not found', fatal: true })
const product = computed(() => data.value!.product)

// Option selection: start from the first in-stock variant.
const selected = reactive<Record<string, string>>({})
function selectVariant(v: Variant | undefined) {
  if (v) Object.assign(selected, v.options)
}
selectVariant(product.value.variants.find((v) => v.inStock) ?? product.value.variants[0])
const variant = computed(() => product.value.variants.find((v) => product.value.options.every((o) => v.options[o.title] === selected[o.title])))
/** A value is offered if some variant has it together with the other current selections. */
function valueState(title: string, value: string): 'available' | 'sold_out' | 'none' {
  const matches = product.value.variants.filter((v) => v.options[title] === value && product.value.options.every((o) => o.title === title || v.options[o.title] === selected[o.title]))
  if (!matches.length) return 'none'
  return matches.some((v) => v.inStock) ? 'available' : 'sold_out'
}

const quantity = ref(1)
const adding = ref(false)
const addError = ref('')
async function addToCart() {
  if (!variant.value) return
  adding.value = true
  addError.value = ''
  try {
    await cartStore.add(variant.value.id, quantity.value, regionQuery.value)
    quantity.value = 1
  } catch (err) {
    addError.value = apiErrorMessage(err, 'Could not add to cart')
  } finally {
    adding.value = false
  }
}

const activeImage = ref(0)
const stockText = computed(() => {
  const v = variant.value
  if (!v) return 'Choose your options'
  if (!v.inStock) return 'Sold out'
  if (v.lowStock) return `Only ${v.lowStock} left`
  if (v.allowBackorder) return 'Available to order'
  return 'In stock, ships from Tema in 1–2 days'
})

const details = computed(() =>
  [
    product.value.material && { label: 'Material', value: product.value.material },
    product.value.originCountry && { label: 'Made in', value: countryName(product.value.originCountry) },
    product.value.weight && { label: 'Weight', value: `${product.value.weight} g` },
    variant.value?.sku && { label: 'SKU', value: variant.value.sku, mono: true },
  ].filter(Boolean) as { label: string; value: string; mono?: boolean }[],
)

// SEO + structured data
const siteUrl = config.public.storeUrl
useSeoMeta({
  title: () => product.value.seoTitle || `${product.value.title} · Kola Market`,
  description: () => product.value.seoDescription || product.value.subtitle || undefined,
  ogTitle: () => product.value.title,
  ogImage: () => (product.value.thumbnail?.startsWith('http') ? product.value.thumbnail : undefined),
  ogType: 'website',
})
useHead({
  link: [{ rel: 'canonical', href: () => `${siteUrl}/products/${product.value.handle}` }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () =>
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.value.title,
          description: product.value.description ?? product.value.subtitle ?? undefined,
          image: product.value.images.filter((i) => i.url.startsWith('http')).map((i) => i.url),
          sku: variant.value?.sku ?? undefined,
          brand: { '@type': 'Brand', name: 'Kola Market' },
          offers: product.value.variants
            .filter((v) => v.price)
            .map((v) => ({
              '@type': 'Offer',
              sku: v.sku ?? undefined,
              price: fromMinor(v.price!.amount, v.price!.currencyCode),
              priceCurrency: v.price!.currencyCode,
              availability: v.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              url: `${siteUrl}/products/${product.value.handle}`,
            })),
        }),
    },
    {
      type: 'application/ld+json',
      innerHTML: () =>
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Shop', item: `${siteUrl}/shop` },
            ...(product.value.collection ? [{ '@type': 'ListItem', position: 2, name: product.value.collection.title, item: `${siteUrl}/collections/${product.value.collection.handle}` }] : []),
            { '@type': 'ListItem', position: product.value.collection ? 3 : 2, name: product.value.title },
          ],
        }),
    },
  ],
})
</script>

<template>
  <div class="pdp">
    <nav aria-label="Breadcrumb" class="crumbs">
      <ol>
        <li><NuxtLink to="/shop">Shop</NuxtLink></li>
        <li v-if="product.collection"><NuxtLink :to="`/collections/${product.collection.handle}`">{{ product.collection.title }}</NuxtLink></li>
        <li><span aria-current="page">{{ product.title }}</span></li>
      </ol>
    </nav>

    <div class="pdp__grid">
      <section class="gallery" aria-label="Product images">
        <StoreImage :src="product.images[activeImage]?.url ?? product.thumbnail" :alt="product.images[activeImage]?.alt ?? product.title" :seed="product.handle" sizes="(max-width: 860px) 100vw, 50vw" eager />
        <ul v-if="product.images.length > 1" class="gallery__thumbs">
          <li v-for="(img, i) in product.images" :key="img.url">
            <button type="button" class="thumb" :aria-pressed="i === activeImage" :aria-label="`Show image ${i + 1}`" @click="activeImage = i">
              <StoreImage :src="img.url" :alt="img.alt ?? ''" :seed="product.handle" ratio="1" sizes="80px" />
            </button>
          </li>
        </ul>
      </section>

      <section class="info">
        <div class="info__head">
          <p v-if="product.collection" class="eyebrow">{{ product.collection.title }}</p>
          <h1 class="section-heading">{{ product.title }}</h1>
          <p v-if="product.subtitle" class="muted">{{ product.subtitle }}</p>
          <p class="lead"><StorePrice :price="variant?.price ?? null" /></p>
        </div>

        <fieldset v-for="o in product.options" :key="o.title" class="opt">
          <legend class="field-label">{{ o.title }}<span class="muted"> · {{ selected[o.title] }}</span></legend>
          <div class="pills" role="radiogroup" :aria-label="o.title">
            <button
              v-for="v in o.values"
              :key="v"
              type="button"
              role="radio"
              class="pill"
              :class="{ 'is-selected': selected[o.title] === v, 'is-soldout': valueState(o.title, v) === 'sold_out' }"
              :aria-checked="selected[o.title] === v"
              :disabled="valueState(o.title, v) === 'none'"
              @click="selected[o.title] = v"
            >
              {{ v }}
            </button>
          </div>
        </fieldset>

        <p class="stock" :class="{ 'text-danger': variant && !variant.inStock, 'text-warn': variant?.lowStock }">
          <span class="stock__dot" aria-hidden="true" />{{ stockText }}
        </p>

        <div class="buy">
          <StoreQuantityStepper v-model="quantity" label="quantity" :max="variant?.lowStock ?? 20" :disabled="!variant?.inStock" />
          <UiButton variant="primary" class="buy__btn" :loading="adding" :disabled="!variant || !variant.inStock || !variant.price" @click="addToCart">
            {{ !variant ? 'Unavailable' : !variant.inStock ? 'Sold out' : 'Add to cart' }}
          </UiButton>
        </div>
        <p v-if="addError" class="text-danger" role="alert">{{ addError }}</p>

        <div class="accordions">
          <details open>
            <summary>Description</summary>
            <p class="prose">{{ product.description }}</p>
          </details>
          <details v-if="details.length">
            <summary>Details</summary>
            <dl class="dl">
              <template v-for="d in details" :key="d.label">
                <dt>{{ d.label }}</dt>
                <dd :class="{ mono: d.mono }">{{ d.value }}</dd>
              </template>
            </dl>
          </details>
          <details>
            <summary>{{ product.isGiftcard ? 'Delivery' : 'Delivery & returns' }}</summary>
            <p v-if="product.isGiftcard" class="prose">Gift cards are emailed within minutes of payment and never expire.</p>
            <p v-else class="prose">Standard delivery in Ghana takes 2–4 working days; express delivery in Accra and Tema arrives same or next day. International orders ship in 7–12 working days. Return unworn items within 30 days.</p>
          </details>
        </div>
      </section>
    </div>

    <section v-if="product.related.length" class="related" aria-labelledby="related-title">
      <h2 id="related-title" class="section-heading">You may also like</h2>
      <StoreProductGrid :products="product.related" />
    </section>
  </div>
</template>

<style scoped>
.pdp {
  padding-top: 24px;
}
.crumbs ol {
  list-style: none;
  margin: 0 0 20px;
  padding: 0;
  display: flex;
  gap: 6px;
  font-size: var(--fs-meta);
  color: var(--ink-3);
  flex-wrap: wrap;
}
.crumbs li + li::before {
  content: '/';
  margin-right: 6px;
}
.crumbs a {
  color: var(--ink-3);
}
.pdp__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: clamp(24px, 4vw, 56px);
  align-items: start;
}
.gallery {
  display: flex;
  flex-direction: column;
  gap: var(--gutter);
  position: sticky;
  top: 84px;
}
.gallery__thumbs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, 72px);
  gap: var(--gutter);
}
.thumb {
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: none;
  cursor: pointer;
  width: 72px;
}
.thumb[aria-pressed='true'] {
  border-color: var(--ink);
}
.info {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.info__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.opt {
  border: 0;
  padding: 0;
  margin: 0;
}
.opt legend {
  margin-bottom: 10px;
}
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pill {
  min-width: 44px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-ui);
  cursor: pointer;
}
.pill:hover:not(:disabled) {
  background: var(--putty-inset);
}
.pill.is-selected {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);
}
.pill.is-soldout:not(.is-selected) {
  color: var(--ink-3);
  text-decoration: line-through;
}
.pill:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.stock {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-ui);
  color: var(--ink-2);
}
.stock__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.stock.text-warn .stock__dot {
  background: var(--orange);
}
.stock.text-danger .stock__dot {
  background: var(--neutral-dot);
}
.buy {
  display: flex;
  gap: 10px;
  align-items: center;
}
.buy__btn {
  flex: 1;
}
.accordions {
  border-top: 1px solid var(--rule);
}
.accordions details {
  border-bottom: 1px solid var(--rule);
  padding: 14px 0;
}
.accordions summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}
.accordions summary::after {
  content: '+';
  color: var(--ink-3);
}
.accordions details[open] summary::after {
  content: '−';
}
.accordions summary::-webkit-details-marker {
  display: none;
}
.accordions .prose,
.accordions .dl {
  margin-top: 12px;
}
.prose {
  color: var(--ink-2);
  max-width: 60ch;
}
.related {
  padding-top: var(--section-gap);
  display: flex;
  flex-direction: column;
  gap: 24px;
}
@media (max-width: 860px) {
  .pdp__grid {
    grid-template-columns: 1fr;
  }
  .gallery {
    position: static;
  }
  .buy :deep(.ui-btn) {
    height: 44px;
  }
}
</style>
