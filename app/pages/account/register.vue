<script setup lang="ts">
import { customerRegisterSchema } from '#shared/schemas/auth'

useSeoMeta({ title: 'Create an account · Kola Market', robots: 'noindex' })
const route = useRoute()
const { register } = useCustomer()
const form = reactive({ firstName: '', lastName: '', email: '', password: '' })
const errors = ref<Record<string, string>>({})
const formError = ref('')
const pending = ref(false)

async function submit() {
  formError.value = ''
  const parsed = customerRegisterSchema.safeParse({ ...form, lastName: form.lastName || undefined })
  if (!parsed.success) {
    errors.value = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))
    return
  }
  errors.value = {}
  pending.value = true
  try {
    await register(parsed.data)
    const r = String(route.query.redirect ?? '')
    await navigateTo(r.startsWith('/') && !r.startsWith('//') ? r : '/account')
  } catch (err) {
    formError.value = apiErrorMessage(err, 'Could not create your account')
    errors.value = apiFieldErrors(err)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="auth">
    <h1 class="section-heading">Create an account</h1>
    <form class="stack" style="--stack-gap: 14px" novalidate @submit.prevent="submit">
      <div class="form-grid">
        <UiInput v-model="form.firstName" label="First name" autocomplete="given-name" required :error="errors.firstName" />
        <UiInput v-model="form.lastName" label="Last name" autocomplete="family-name" :error="errors.lastName" />
      </div>
      <UiInput v-model="form.email" label="Email" type="email" autocomplete="email" required :error="errors.email" />
      <UiInput v-model="form.password" label="Password" type="password" autocomplete="new-password" hint="At least 8 characters" required :error="errors.password" />
      <p v-if="formError" class="text-danger" role="alert">{{ formError }}</p>
      <UiButton type="submit" variant="primary" block :loading="pending">Create account</UiButton>
    </form>
    <p class="muted">Already have an account? <NuxtLink :to="{ path: '/account/login', query: route.query }">Sign in</NuxtLink>.</p>
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
