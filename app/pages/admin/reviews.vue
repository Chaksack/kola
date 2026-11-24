<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Reviews · Kola' })

interface Review {
  id: string
  authorName: string
  rating: number
  title: string | null
  body: string | null
  status: string
  createdAt: string
  productTitle: string
  productHandle: string
}
const toast = useToast()
const status = ref<'pending' | 'approved' | 'rejected'>('pending')
const { data, refresh } = await useFetch<{ data: Review[]; count: number; counts: Record<string, number> }>('/api/admin/reviews', { server: false, query: computed(() => ({ status: status.value })), default: () => ({ data: [], count: 0, counts: {} }) })
async function moderate(r: Review, next: string) {
  try {
    await api(`/api/admin/reviews/${r.id}`, { method: 'POST', body: { status: next } })
    toast.success(next === 'approved' ? 'Review published' : next === 'rejected' ? 'Review rejected' : 'Moved back to pending')
    await refresh()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Extensions' }, { label: 'Reviews' }]" title="Reviews" subtitle="Customer reviews are held for moderation. Published reviews appear on product pages." />
    <UiTabs
      v-model="status"
      label="Review status"
      :items="[
        { value: 'pending', label: 'Pending', count: data.counts.pending ?? 0 },
        { value: 'approved', label: 'Published', count: data.counts.approved ?? 0 },
        { value: 'rejected', label: 'Rejected', count: data.counts.rejected ?? 0 },
      ]"
    />
    <UiCard flush>
      <ul v-if="data.data.length" class="reviews">
        <li v-for="r in data.data" :key="r.id" class="review">
          <div class="review__head">
            <span class="stars" :aria-label="`${r.rating} out of 5`">{{ stars(r.rating) }}</span>
            <strong class="review__title">{{ r.title }}</strong>
            <span class="spacer" />
            <span class="meta">{{ new Date(r.createdAt).toLocaleDateString('en-GB') }}</span>
          </div>
          <p v-if="r.body" class="ink-2">{{ r.body }}</p>
          <p class="meta">{{ r.authorName }} on <NuxtLink :to="`/products/${r.productHandle}`" target="_blank">{{ r.productTitle }}</NuxtLink></p>
          <div class="row">
            <UiButton v-if="r.status !== 'approved'" size="sm" variant="primary" @click="moderate(r, 'approved')">Publish</UiButton>
            <UiButton v-if="r.status !== 'rejected'" size="sm" @click="moderate(r, 'rejected')">Reject</UiButton>
            <UiButton v-if="r.status !== 'pending'" size="sm" variant="ghost" @click="moderate(r, 'pending')">Move to pending</UiButton>
          </div>
        </li>
      </ul>
      <UiEmptyState v-else :title="status === 'pending' ? 'Nothing to moderate' : 'No reviews here'" />
    </UiCard>
  </div>
</template>

<style scoped>
.reviews {
  list-style: none;
  margin: 0;
  padding: 0;
}
.review {
  padding: 16px;
  border-bottom: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: var(--fs-ui);
}
.review:last-child {
  border-bottom: 0;
}
.review__head {
  display: flex;
  gap: 10px;
  align-items: baseline;
}
.review__title {
  font-weight: 500;
}
.stars {
  color: var(--ink);
  letter-spacing: 1px;
}
</style>
