<script setup lang="ts">
useSeoMeta({ title: 'Collections · Kola Market' })
const { data } = await useStoreFetch<{ data: { id: string; title: string; handle: string; description: string | null; thumbnail: string | null; productCount: number }[] }>('/api/store/collections', { key: 'store-collections', default: () => ({ data: [] }) })
</script>

<template>
  <div class="collections">
    <header class="head">
      <h1 class="section-heading">Collections</h1>
      <p class="lead heading-second">Edits for the season, the table and the pantry.</p>
    </header>
    <ul class="grid">
      <li v-for="c in data.data" :key="c.id">
        <NuxtLink :to="`/collections/${c.handle}`" class="tile">
          <StoreImage :src="c.thumbnail" :alt="c.title" :seed="c.handle" ratio="3 / 2" />
          <div class="tile__text">
            <h2 class="lead">{{ c.title }}</h2>
            <p class="muted">{{ c.description }}</p>
            <p class="meta num">{{ c.productCount }} products</p>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.collections {
  padding-top: 40px;
}
.head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 32px;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--gutter);
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 8px 18px;
  background: var(--putty);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
}
.tile:hover h2 {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.tile__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 6px;
}
</style>
