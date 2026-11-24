<script setup lang="ts">
import type { ProductCardData } from '~/components/store/ProductCard.vue'

useSeoMeta({
  title: 'Kola Market · Goods made in Ghana',
  description: 'Kente totes, shea butter, Adinkra linen and Bolga baskets, made by Ghanaian makers and shipped from Tema.',
  ogTitle: 'Kola Market',
  ogDescription: 'Goods made in Ghana, from Bonwire looms to Bolga weavers.',
})

const { regionQuery } = useRegion()
type List = { data: ProductCardData[] }
const [{ data: featured }, { data: arrivals }] = await Promise.all([
  useStoreFetch<List>('/api/store/products', { key: 'home-featured', query: computed(() => ({ collection: 'harmattan-edit', limit: 8, regionId: regionQuery.value })), default: () => ({ data: [] }) }),
  useStoreFetch<List>('/api/store/products', { key: 'home-arrivals', query: computed(() => ({ order: 'newest', limit: 8, regionId: regionQuery.value })), default: () => ({ data: [] }) }),
])
</script>

<template>
  <div class="home">
    <section class="hero">
      <p class="hero__opening">Goods made in Ghana, from Bonwire looms to Bolga weavers.</p>
      <h1 class="display hero__title">
        Made slowly.
        <span class="heading-second">Carried for years.</span>
      </h1>
      <div class="row hero__cta">
        <UiButton variant="primary" to="/shop">Shop now</UiButton>
        <UiButton to="/collections">Browse collections</UiButton>
      </div>
    </section>

    <section v-if="featured.data.length" class="section" aria-labelledby="featured-title">
      <div class="section__head">
        <div>
          <p class="eyebrow">Featured collection</p>
          <h2 id="featured-title" class="section-heading">Harmattan Edit</h2>
        </div>
        <NuxtLink to="/collections/harmattan-edit" class="link">View the collection</NuxtLink>
      </div>
      <ul class="rail">
        <li v-for="(p, i) in featured.data" :key="p.id"><StoreProductCard :product="p" :eager="i < 2" /></li>
      </ul>
    </section>

    <section class="section" aria-labelledby="arrivals-title">
      <div class="section__head">
        <div>
          <p class="eyebrow">Just in</p>
          <h2 id="arrivals-title" class="section-heading">New arrivals</h2>
        </div>
        <NuxtLink to="/shop" class="link">Shop everything</NuxtLink>
      </div>
      <StoreProductGrid :products="arrivals.data" />
    </section>

    <section class="band" aria-labelledby="band-title">
      <div class="band__text">
        <p class="eyebrow">Our makers</p>
        <h2 id="band-title" class="section-heading">
          Twelve workshops.
          <span class="heading-second">One warehouse in Tema.</span>
        </h2>
        <p class="lead">We buy directly from weavers, potters and cooperatives across Ghana, pay on delivery to our warehouse, and ship from there within a day.</p>
        <NuxtLink to="/about#makers" class="link">Meet the makers</NuxtLink>
      </div>
      <div class="band__media" aria-hidden="true">
        <div class="band__tile" style="background: var(--stage-warm)" />
        <div class="band__tile" style="background: var(--stage-sage)" />
        <div class="band__tile" style="background: var(--stage-stone)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  padding: 72px 0 var(--section-gap);
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 980px;
}
.hero__opening {
  font-size: var(--fs-title);
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--ink-2);
}
.hero__title {
  display: flex;
  flex-direction: column;
}
.hero__cta {
  margin-top: 12px;
}
.section {
  padding-bottom: var(--section-gap);
}
.section__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.section__head .eyebrow {
  margin-bottom: 6px;
}
.rail {
  list-style: none;
  margin: 0;
  padding: 0 0 8px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 1fr);
  gap: var(--gutter);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}
.rail > li {
  scroll-snap-align: start;
  min-width: 220px;
}
.band {
  background: var(--putty);
  border-radius: var(--radius);
  padding: clamp(24px, 5vw, 56px);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: center;
}
.band__text {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.band__text .section-heading {
  display: flex;
  flex-direction: column;
}
.band__text .lead {
  color: var(--ink-2);
}
.band__media {
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: var(--gutter);
  aspect-ratio: 4 / 3;
}
.band__tile {
  border-radius: var(--radius);
}
.band__tile:first-child {
  grid-row: span 2;
}
@media (max-width: 860px) {
  .hero {
    padding-top: 40px;
  }
  .display {
    font-size: 44px;
  }
  .band {
    grid-template-columns: 1fr;
  }
}
</style>
