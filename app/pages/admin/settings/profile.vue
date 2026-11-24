<script setup lang="ts">
definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Profile · Settings' })

const toast = useToast()
const { admin, logout, refreshSession } = useAdmin()
const [first = '', ...rest] = (admin.value?.name ?? '').split(' ')
const profile = reactive({ firstName: first, lastName: rest.join(' ') })
const password = reactive({ currentPassword: '', newPassword: '' })
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const changing = ref(false)

async function saveProfile() {
  saving.value = true
  try {
    await $fetch('/api/admin/users/me', { method: 'PATCH', body: profile })
    await refreshSession()
    toast.success('Profile saved')
  } catch (err) {
    toast.error(apiErrorMessage(err))
  } finally {
    saving.value = false
  }
}

async function changePassword() {
  changing.value = true
  errors.value = {}
  try {
    await $fetch('/api/admin/users/me', { method: 'PATCH', body: password })
    password.currentPassword = ''
    password.newPassword = ''
    toast.success('Password changed')
  } catch (err) {
    errors.value = apiFieldErrors(err)
    if (!Object.keys(errors.value).length) toast.error(apiErrorMessage(err))
  } finally {
    changing.value = false
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Profile' }]" title="Profile" :search="false">
      <template #actions>
        <UiButton @click="logout">Sign out</UiButton>
      </template>
    </AdminPageHeader>

    <UiCard title="Your details">
      <form class="stack" style="--stack-gap: 14px; max-width: 520px" @submit.prevent="saveProfile">
        <div class="form-grid">
          <UiInput v-model="profile.firstName" label="First name" autocomplete="given-name" />
          <UiInput v-model="profile.lastName" label="Last name" autocomplete="family-name" />
        </div>
        <UiInput :model-value="admin?.email" label="Email" disabled mono />
        <p class="meta">Role: {{ admin?.role }}</p>
        <div><UiButton type="submit" variant="primary" :loading="saving">Save</UiButton></div>
      </form>
    </UiCard>

    <UiCard title="Password">
      <form class="stack" style="--stack-gap: 14px; max-width: 520px" @submit.prevent="changePassword">
        <UiInput v-model="password.currentPassword" label="Current password" type="password" autocomplete="current-password" :error="errors.currentPassword" />
        <UiInput v-model="password.newPassword" label="New password" type="password" autocomplete="new-password" hint="At least 8 characters" :error="errors.newPassword" />
        <div><UiButton type="submit" :loading="changing" :disabled="!password.newPassword">Change password</UiButton></div>
      </form>
    </UiCard>
  </div>
</template>
