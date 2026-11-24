<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const isAdmin = computed(() => useRoute().path.startsWith('/admin'))
const notFound = computed(() => props.error.statusCode === 404)
useSeoMeta({ title: () => (notFound.value ? 'Not found' : 'Something went wrong'), robots: 'noindex' })
</script>

<template>
  <NuxtLayout :name="isAdmin ? 'auth' : 'default'">
    <section class="err">
      <p class="eyebrow mono">{{ error.statusCode }}</p>
      <h1 class="section-heading">
        {{ notFound ? "We couldn't find that page." : 'Something went wrong.' }}
        <span class="heading-second">{{ notFound ? 'It may have moved or sold out.' : 'Please try again in a moment.' }}</span>
      </h1>
      <div class="row">
        <UiButton variant="primary" @click="clearError({ redirect: isAdmin ? '/admin' : '/' })">{{ isAdmin ? 'Back to admin' : 'Back to the shop' }}</UiButton>
      </div>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.err {
  padding: 80px 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 640px;
}
.err .section-heading {
  display: flex;
  flex-direction: column;
}
</style>
