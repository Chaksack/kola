<script setup lang="ts">
import { loginSchema } from '#shared/schemas/auth'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Sign in · Kola Commerce', robots: 'noindex' })

const route = useRoute()
const { fetch: refreshSession, session } = useUserSession()
const form = reactive({ email: '', password: '' })
const errors = ref<Record<string, string>>({})
const formError = ref('')
const pending = ref(false)

const redirectTo = computed(() => {
  const r = String(route.query.redirect ?? '')
  return r.startsWith('/admin') && !r.startsWith('//') ? r : '/admin/orders'
})

onMounted(async () => {
  if (!session.value?.admin) await refreshSession()
  if (session.value?.admin) await navigateTo(redirectTo.value, { replace: true })
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
    await $fetch('/api/admin/auth/login', { method: 'POST', body: parsed.data })
    await refreshSession()
    await navigateTo(redirectTo.value, { replace: true })
  } catch (err) {
    formError.value = apiErrorMessage(err, 'Sign in failed')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="stack" style="--stack-gap: 20px">
    <div class="stack" style="--stack-gap: 4px">
      <h1 class="page-title">Sign in</h1>
      <p class="muted">Kola Market admin</p>
    </div>
    <form class="stack" style="--stack-gap: 14px" novalidate @submit.prevent="submit">
      <UiInput v-model="form.email" label="Email" type="email" autocomplete="username" required :error="errors.email" />
      <UiInput v-model="form.password" label="Password" type="password" autocomplete="current-password" required :error="errors.password" />
      <p v-if="formError" class="text-danger" role="alert">{{ formError }}</p>
      <UiButton type="submit" variant="primary" block :loading="pending">Sign in</UiButton>
    </form>
    <p class="meta">New team member? Use the invite link you were sent.</p>
  </div>
</template>
