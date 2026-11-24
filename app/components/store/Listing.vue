<script setup lang="ts">
import type { ProductCardData } from './ProductCard.vue'
import { formatMoney, fromMinor, toMinor } from '#shared/utils/money'

const props = defineProps<{ collection?: string; category?: string; title: string; description?: string | null; crumbs?: { label: string; to?: string }[] }>()

interface ListResult {
  data: ProductCardData[]
  count: number
  limit: number
  offset: number
  facets: { options: Record<string, string[]>; price: { min: number | null; max: number | null; currencyCode: string } }
}

const route = useRoute()
const router = useRouter()
const { regionQuery, region } = useRegion()
const LIMIT = 24

const q = computed(() => route.query)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const selectedOptions = computed(() => (str(q.value.options) ?? '').split(',').filter(Boolean))

const query = computed(() => ({
  limit: LIMIT,
  offset: Number(q.value.offset ?? 0) || 0,
  order: str(q.value.sort) ?? 'newest',
  collection: props.collection,
  category: props.category,
  options: selectedOptions.value.join(',') || undefined,
  minPrice: str(q.value.min),
  maxPrice: str(q.value.max),
  inStock: str(q.value.inStock),
  regionId: regionQuery.value,
}))

const { data, pending } = await useStoreFetch<ListResult>('/api/store/products', {
  query,
  key: `listing-${props.collection ?? ''}-${props.category ?? ''}`,
  default: () => ({ data: [], count: 0, limit: LIMIT, offset: 0, facets: { options: {}, price: { min: null, max: null, currencyCode: 'GHS' } } }),
})

function setQuery(patch: Record<string, string | undefined>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch, offset: patch.offset })) if (typeof v === 'string' && v) next[k] = v
  router.push({ query: next })
}
function toggleOption(value: string, on: boolean) {
  const set = new Set(selectedOptions.value)
  if (on) set.add(value)
  else set.delete(value)
  setQuery({ options: [...set].join(',') || undefined })
}

// Price filter inputs are in major units; the API takes minor units.
const currency = computed(() => data.value.facets.price.currencyCode || region.value?.currencyCode || 'GHS')
const priceMin = ref(str(q.value.min) ? fromMinor(Number(q.value.min), currency.value) : '')
const priceMax = ref(str(q.value.max) ? fromMinor(Number(q.value.max), currency.value) : '')
function applyPrice() {
  try {
    setQuery({ min: priceMin.value ? String(toMinor(priceMin.value, currency.value)) : undefined, max: priceMax.value ? String(toMinor(priceMax.value, currency.value)) : undefined })
  } catch {
    // ignore invalid input
  }
}
function clearFilters() {
  priceMin.value = ''
  priceMax.value = ''
  setQuery({ options: undefined, min: undefined, max: undefined, inStock: undefined })
}
const hasFilters = computed(() => Boolean(selectedOptions.value.length || q.value.min || q.value.max || q.value.inStock))
const filtersOpen = ref(false)

const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'title', label: 'Name' },
]
const offset = computed(() => Number(q.value.offset ?? 0) || 0)
</script>

<template>
  <div class="listing">
    <nav v-if="crumbs?.length" aria-label="Breadcrumb" class="crumbs">
      <ol>
        <li><NuxtLink to="/">Home</NuxtLink></li>
        <li v-for="c in crumbs" :key="c.label">
          <NuxtLink v-if="c.to" :to="c.to">{{ c.label }}</NuxtLink>
          <span v-else aria-current="page">{{ c.label }}</span>
        </li>
      </ol>
    </nav>
    <header class="listing__head">
      <h1 class="section-heading">{{ title }}</h1>
      <p v-if="description" class="lead heading-second">{{ description }}</p>
      <slot name="intro" />
    </header>

    <div class="listing__bar">
      <button type="button" class="filters-toggle" :aria-expanded="filtersOpen" aria-controls="filters" @click="filtersOpen = !filtersOpen">Filters{{ hasFilters ? ' · on' : '' }}</button>
      <span class="meta num">{{ data.count }} {{ data.count === 1 ? 'product' : 'products' }}</span>
      <label class="sort">
        <span class="meta">Sort</span>
        <select :value="query.order" @change="setQuery({ sort: ($event.target as HTMLSelectElement).value === 'newest' ? undefined : ($event.target as HTMLSelectElement).value })">
          <option v-for="s in sortOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </label>
    </div>

    <div class="listing__body">
      <aside id="filters" class="filters" :class="{ 'is-open': filtersOpen }" aria-label="Filters">
        <section class="filter">
          <h2 class="eyebrow">Availability</h2>
          <UiCheckbox :model-value="Boolean(q.inStock)" label="In stock only" @update:model-value="setQuery({ inStock: $event ? '1' : undefined })" />
        </section>
        <section class="filter">
          <h2 class="eyebrow">Price ({{ currency }})</h2>
          <form class="price-form" @submit.prevent="applyPrice">
            <UiInput v-model="priceMin" label="Minimum price" hide-label inputmode="decimal" :placeholder="data.facets.price.min != null ? fromMinor(data.facets.price.min, currency) : 'Min'" />
            <span class="muted">–</span>
            <UiInput v-model="priceMax" label="Maximum price" hide-label inputmode="decimal" :placeholder="data.facets.price.max != null ? fromMinor(data.facets.price.max, currency) : 'Max'" />
            <UiButton type="submit" size="sm">Apply</UiButton>
          </form>
          <p v-if="data.facets.price.min != null" class="meta">From {{ formatMoney(data.facets.price.min, currency) }} to {{ formatMoney(data.facets.price.max ?? 0, currency) }}</p>
        </section>
        <section v-for="(values, optionTitle) in data.facets.options" :key="optionTitle" class="filter">
          <h2 class="eyebrow">{{ optionTitle }}</h2>
          <div class="option-list">
            <UiCheckbox v-for="v in values" :key="v" :model-value="selectedOptions.includes(v)" :label="v" @update:model-value="toggleOption(v, Boolean($event))" />
          </div>
        </section>
        <UiButton v-if="hasFilters" variant="ghost" size="sm" @click="clearFilters">Clear filters</UiButton>
      </aside>

      <div class="results">
        <StoreProductGrid v-if="data.data.length" :products="data.data" :columns="3" :eager-count="3" />
        <div v-else-if="!pending" class="empty">
          <p>No products match.</p>
          <UiButton v-if="hasFilters" @click="clearFilters">Clear filters</UiButton>
        </div>
        <nav v-if="data.count > LIMIT" class="pager" aria-label="Pagination">
          <UiButton size="sm" :disabled="offset === 0" @click="setQuery({ offset: offset - LIMIT > 0 ? String(offset - LIMIT) : undefined })">Previous</UiButton>
          <span class="meta num">Page {{ Math.floor(offset / LIMIT) + 1 }} of {{ Math.ceil(data.count / LIMIT) }}</span>
          <UiButton size="sm" :disabled="offset + LIMIT >= data.count" @click="setQuery({ offset: String(offset + LIMIT) })">Next</UiButton>
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.listing {
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
}
.crumbs li + li::before {
  content: '/';
  margin-right: 6px;
}
.crumbs a {
  color: var(--ink-3);
}
.listing__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 720px;
  margin-bottom: 28px;
}
.listing__bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  margin-bottom: 20px;
}
.filters-toggle {
  display: none;
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-pill);
  height: 36px;
  padding: 0 14px;
  font: inherit;
  font-size: var(--fs-ui);
  color: var(--ink);
  cursor: pointer;
}
.sort {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.sort select {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-size: var(--fs-ui);
}
.listing__body {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 32px;
  align-items: start;
}
.filters {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: 84px;
}
.filter {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--rule);
}
.option-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.price-form {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 6px;
  align-items: center;
}
.price-form :deep(.ui-btn) {
  grid-column: 1 / -1;
  justify-self: start;
}
.empty {
  padding: 48px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 32px;
}
@media (max-width: 860px) {
  .listing__body {
    grid-template-columns: 1fr;
  }
  .filters-toggle {
    display: inline-flex;
    align-items: center;
  }
  .filters {
    display: none;
    position: static;
  }
  .filters.is-open {
    display: flex;
  }
}
</style>
