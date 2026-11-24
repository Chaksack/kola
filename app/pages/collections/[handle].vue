<script setup lang="ts">
const route = useRoute()
const handle = computed(() => String(route.params.handle))
const { data, error } = await useStoreFetch<{ collection: { title: string; handle: string; description: string | null } }>(() => `/api/store/collections/${handle.value}`, { key: `collection-${handle.value}` })
if (error.value) throw createError({ statusCode: 404, statusMessage: 'Collection not found', fatal: true })
useSeoMeta({ title: () => `${data.value?.collection.title ?? 'Collection'} · Kola Market`, description: () => data.value?.collection.description ?? undefined })
useHead({
  script: [{ type: 'application/ld+json', innerHTML: () => JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Collections', item: '/collections' }, { '@type': 'ListItem', position: 2, name: data.value?.collection.title }] }) }],
})
</script>

<template>
  <StoreListing
    v-if="data"
    :collection="handle"
    :title="data.collection.title"
    :description="data.collection.description"
    :crumbs="[{ label: 'Collections', to: '/collections' }, { label: data.collection.title }]"
  />
</template>
