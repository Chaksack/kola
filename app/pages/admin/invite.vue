<script setup lang="ts">
import { inviteAcceptSchema } from '#shared/schemas/auth'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Accept invite · Kola Commerce', robots: 'noindex' })

const route = useRoute()
const token = computed(() => String(route.query.token ?? ''))
const { fetch: refreshSession } = useUserSession()

const { data, error } = await useFetch('/api/admin/invites/lookup', {
  query: { token },
  server: false,
  immediate: Boolean(token.value),
})

const form = reactive({ firstName: '', lastName: '', password: '' })
const errors = ref<Record<string, string>>({})
const formError = ref('')
const pending = ref(false)

async function submit() {
  formError.value = ''
  const parsed = inviteAcceptSchema.safeParse({ ...form, token: token.value })
  if (!parsed.success) {
    errors.value = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))
    return
  }
  errors.value = {}
  pending.value = true
  try {
    await $fetch('/api/admin/invites/accept', { method: 'POST', body: parsed.data })
    await refreshSession()
    await navigateTo('/admin/orders', { replace: true })
  } catch (err) {
    formError.value = apiErrorMessage(err, 'Could not accept the invite')
    errors.value = apiFieldErrors(err)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="stack" style="--stack-gap: 20px">
    <div class="stack" style="--stack-gap: 4px">
      <h1 class="page-title">Join Kola Market</h1>
      <p v-if="data" class="muted">
        You've been invited as <strong>{{ data.invite.role }}</strong> with <span class="mono">{{ data.invite.email }}</span>.
      </p>
    </div>
    <p v-if="!token || error" class="text-danger" role="alert">This invite link is invalid or has expired. Ask an admin to send a new one.</p>
    <form v-else class="stack" style="--stack-gap: 14px" novalidate @submit.prevent="submit">
      <div class="form-grid">
        <UiInput v-model="form.firstName" label="First name" autocomplete="given-name" required :error="errors.firstName" />
        <UiInput v-model="form.lastName" label="Last name" autocomplete="family-name" :error="errors.lastName" />
      </div>
      <UiInput v-model="form.password" label="Password" type="password" autocomplete="new-password" hint="At least 8 characters" required :error="errors.password" />
      <p v-if="formError" class="text-danger" role="alert">{{ formError }}</p>
      <UiButton type="submit" variant="primary" block :loading="pending" :disabled="!data">Create account</UiButton>
    </form>
  </div>
</template>
