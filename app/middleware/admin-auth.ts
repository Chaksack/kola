export default defineNuxtRouteMiddleware(async (to) => {
  const { session, fetch } = useUserSession()
  if (!session.value?.admin) await fetch()
  if (!session.value?.admin) {
    return navigateTo({ path: '/admin/login', query: to.fullPath !== '/admin' ? { redirect: to.fullPath } : {} })
  }
})
