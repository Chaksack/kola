import { hasRole, type UserRole } from '#shared/utils/roles'

export function useAdmin() {
  const { session, fetch } = useUserSession()
  const admin = computed(() => session.value?.admin ?? null)
  const can = (role: UserRole) => (admin.value ? hasRole(admin.value.role, role) : false)

  async function logout() {
    await $fetch('/api/admin/auth/logout', { method: 'POST' })
    await fetch()
    await navigateTo('/admin/login')
  }

  return { admin, can, logout, refreshSession: fetch }
}
