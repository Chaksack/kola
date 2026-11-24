<script setup lang="ts">
import { loginSchema } from '#shared/schemas/auth'

useSeoMeta({ title: 'Sign in · Kola Market', robots: 'noindex' })
const route = useRoute()
const { login } = useCustomer()
const form = reactive({ email: '', password: '' })
const errors = ref<Record<string, string>>({})
const formError = ref('')
const pending = ref(false)
const redirect = computed(() => {
  const r = String(route.query.redirect ?? '')
  return r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/admin') ? r : '/account'
})

async function submit() {
  formError.value = ''
  const parsed = loginSchema.safeParse(form)
  if (!parsed.success) {
    errors.value = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))
    return
  }
  errors.value = {}
  pending.value = true
  try {
    await login(parsed.data.email, parsed.data.password)
    await navigateTo(redirect.value)
  } catch (err) {
    formError.value = apiErrorMessage(err, 'Sign in failed')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="auth">
    <h1 class="section-heading">Sign in</h1>
    <form class="stack" style="--stack-gap: 14px" novalidate @submit.prevent="submit">
      <UiInput v-model="form.email" label="Email" type="email" autocomplete="email" required :error="errors.email" />
      <UiInput v-model="form.password" label="Password" type="password" autocomplete="current-password" required :error="errors.password" />
      <p v-if="formError" class="text-danger" role="alert">{{ formError }}</p>
      <UiButton type="submit" variant="primary" block :loading="pending">Sign in</UiButton>
    </form>
    <p class="muted">New here? <NuxtLink :to="{ path: '/account/register', query: route.query }">Create an account</NuxtLink>. You can also check out as a guest.</p>
  </div>
</template>

<style scoped>
.auth {
  max-width: 400px;
  margin: 56px auto 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
