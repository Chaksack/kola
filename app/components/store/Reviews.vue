<script setup lang="ts">
const props = defineProps<{ handle: string }>()
interface Review {
  id: string
  authorName: string
  rating: number
  title: string | null
  body: string | null
  createdAt: string
}
const { data } = await useStoreFetch<{ data: Review[]; count: number; average: number | null }>(() => `/api/store/products/${props.handle}/reviews`, { key: `reviews-${props.handle}`, server: false, default: () => ({ data: [], count: 0, average: null }) })
const { customer } = useCustomer()
const open = ref(false)
const form = reactive({ authorName: customer.value?.name ?? '', rating: 5, title: '', body: '' })
const sent = ref(false)
const error = ref('')
async function submit() {
  error.value = ''
  try {
    await storeFetch(`/api/store/products/${props.handle}/reviews`, { method: 'POST', body: { ...form, title: form.title || null, body: form.body || null } })
    sent.value = true
  } catch (err) {
    error.value = apiErrorMessage(err, 'Could not send your review')
  }
}
const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))
</script>

<template>
  <section class="reviews" aria-labelledby="reviews-title">
    <div class="reviews__head">
      <h2 id="reviews-title" class="section-heading">Reviews</h2>
      <p v-if="data.average" class="lead"><span class="stars" :aria-label="`${data.average} out of 5`">{{ stars(data.average) }}</span> {{ data.average }} · {{ data.count }} review{{ data.count === 1 ? '' : 's' }}</p>
      <UiButton v-if="!open && !sent" @click="open = true">Write a review</UiButton>
    </div>
    <form v-if="open && !sent" class="reviews__form" @submit.prevent="submit">
      <fieldset class="rating">
        <legend class="field-label">Rating</legend>
        <label v-for="n in 5" :key="n" class="rating__opt"><input v-model="form.rating" type="radio" name="rating" :value="n"><span>{{ n }}★</span></label>
      </fieldset>
      <div class="form-grid">
        <UiInput v-model="form.authorName" label="Your name" required />
        <UiInput v-model="form.title" label="Headline" />
      </div>
      <UiTextarea v-model="form.body" label="Review" :rows="4" />
      <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      <div class="row"><UiButton type="submit" variant="primary">Submit review</UiButton><UiButton @click="open = false">Cancel</UiButton></div>
    </form>
    <p v-if="sent" class="muted" role="status">Thanks! Your review will appear once it's been checked.</p>
    <ul v-if="data.data.length" class="reviews__list">
      <li v-for="r in data.data" :key="r.id">
        <p><span class="stars" :aria-label="`${r.rating} out of 5`">{{ stars(r.rating) }}</span> <strong>{{ r.title }}</strong></p>
        <p v-if="r.body" class="ink-2">{{ r.body }}</p>
        <p class="meta">{{ r.authorName }} · {{ new Date(r.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }}</p>
      </li>
    </ul>
    <p v-else-if="!open" class="muted">No reviews yet.</p>
  </section>
</template>

<style scoped>
.reviews {
  padding-top: var(--section-gap);
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 760px;
}
.reviews__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.reviews__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--putty);
  border-radius: var(--radius);
}
.rating {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.rating legend {
  margin-bottom: 6px;
}
.rating__opt input {
  position: absolute;
  opacity: 0;
}
.rating__opt span {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.rating__opt input:checked + span {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.rating__opt input:focus-visible + span {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.reviews__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.reviews__list li {
  padding: 16px 0;
  border-top: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stars {
  letter-spacing: 1px;
}
strong {
  font-weight: 500;
}
</style>
