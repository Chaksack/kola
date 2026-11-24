export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, user, fetch } = useUserSession()
  if (!loggedIn.value) await fetch()
  if (!loggedIn.value || user.value?.actor !== 'admin') {
    return navigateTo({ path: '/admin/login', query: { redirect: to.fullPath } })
  }
})
