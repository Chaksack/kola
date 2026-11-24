export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, user, fetch } = useUserSession()
  if (!loggedIn.value) await fetch()
  if (!loggedIn.value || user.value?.actor !== 'customer') {
    return navigateTo({ path: '/account/login', query: { redirect: to.fullPath } })
  }
})
