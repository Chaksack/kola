<script setup lang="ts">
interface Category {
  id: string
  name: string
  handle: string
  description: string | null
  parentId: string | null
}
const route = useRoute()
const path = computed(() => (Array.isArray(route.params.handle) ? route.params.handle : [route.params.handle]).filter(Boolean) as string[])
const leaf = computed(() => path.value[path.value.length - 1] ?? '')
const { data } = await useStoreFetch<{ data: Category[] }>('/api/store/categories', { key: 'store-categories', default: () => ({ data: [] }) })
const category = computed(() => data.value.data.find((c) => c.handle === leaf.value))
if (!category.value) throw createError({ statusCode: 404, statusMessage: 'Category not found', fatal: true })

const trail = computed(() => {
  const out: Category[] = []
  for (let c = category.value; c; c = data.value.data.find((x) => x.id === c!.parentId)) out.unshift(c)
  return out
})
const children = computed(() => data.value.data.filter((c) => c.parentId === category.value?.id))
const crumbs = computed(() => trail.value.map((c, i) => ({ label: c.name, to: i < trail.value.length - 1 ? `/categories/${trail.value.slice(0, i + 1).map((x) => x.handle).join('/')}` : undefined })))
useSeoMeta({ title: () => `${category.value?.name ?? 'Category'} · Kola Market`, description: () => category.value?.description ?? undefined })
useHead({
  script: [{ type: 'application/ld+json', innerHTML: () => JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.value.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `/categories/${trail.value.slice(0, i + 1).map((x) => x.handle).join('/')}` })) }) }],
})
</script>

<template>
  <div v-if="category">
    <StoreListing :category="category.handle" :title="category.name" :description="category.description" :crumbs="crumbs">
      <template #intro>
        <nav v-if="children.length" class="subcats" aria-label="Subcategories">
          <NuxtLink v-for="c in children" :key="c.id" :to="`${route.path.replace(/\/$/, '')}/${c.handle}`" class="subcat">{{ c.name }}</NuxtLink>
        </nav>
      </template>
    </StoreListing>
  </div>
</template>

<style scoped>
.subcats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.subcat {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--outline);
  border-radius: var(--radius-pill);
  color: var(--ink-2);
  font-size: var(--fs-ui);
}
</style>
