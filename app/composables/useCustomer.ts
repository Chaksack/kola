export function useCustomer() {
  const { session, fetch } = useUserSession()
  const customer = computed(() => session.value?.customer ?? null)
  const cartStore = useCartStore()

  async function afterAuth() {
    await fetch()
    // Attach an anonymous cart to the account and re-price it for their groups.
    if (cartStore.cart) await cartStore.updateCart({}).catch(() => undefined)
  }

  async function login(email: string, password: string) {
    await storeFetch('/api/store/auth/login', { method: 'POST', body: { email, password } })
    await afterAuth()
  }

  async function register(body: { email: string; password: string; firstName: string; lastName?: string }) {
    await storeFetch('/api/store/customers', { method: 'POST', body })
    await afterAuth()
  }

  async function logout() {
    await storeFetch('/api/store/auth/logout', { method: 'POST' })
    await fetch()
    cartStore.clear()
    await navigateTo('/')
  }

  return { customer, login, register, logout }
}
