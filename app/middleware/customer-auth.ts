export default defineNuxtRouteMiddleware(async (to) => {
  const { session, fetch } = useUserSession()
  if (!session.value?.customer) await fetch()
  if (!session.value?.customer) {
    return navigateTo({ path: '/account/login', query: { redirect: to.fullPath } })
  }
})
