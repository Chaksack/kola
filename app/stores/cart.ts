import { defineStore } from 'pinia'
import type { CartView } from '../../server/services/cart'

export type StoreCart = Omit<CartView, '_promotionResult'>

/** The cart spans every storefront page, so it lives in Pinia. Its id is kept in a cookie. */
export const useCartStore = defineStore('cart', () => {
  const cookie = useCookie<string | null>('kola_cart', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 14 })
  const cart = ref<StoreCart | null>(null)
  const drawerOpen = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')

  const count = computed(() => cart.value?.totals.itemCount ?? 0)

  async function run(fn: () => Promise<{ cart: StoreCart; removedItems?: string[] }>) {
    busy.value = true
    error.value = ''
    try {
      const res = await fn()
      cart.value = res.cart
      cookie.value = res.cart.id
      if (res.removedItems?.length) notice.value = `${res.removedItems.join(', ')} isn't available in this region and was removed.`
      return res.cart
    } catch (err) {
      error.value = apiErrorMessage(err)
      throw err
    } finally {
      busy.value = false
    }
  }

  async function load() {
    if (!cookie.value) return null
    try {
      const res = await storeFetch<{ cart: StoreCart }>(`/api/store/carts/${cookie.value}`)
      if (res.cart.completedAt) {
        cookie.value = null
        cart.value = null
        return null
      }
      cart.value = res.cart
    } catch {
      cookie.value = null
      cart.value = null
    }
    return cart.value
  }

  async function ensure(regionId?: string) {
    if (cart.value) return cart.value
    if (await load()) return cart.value!
    return run(() => storeFetch('/api/store/carts', { method: 'POST', body: { regionId } }))
  }

  async function add(variantId: string, quantity = 1, regionId?: string) {
    const c = await ensure(regionId)
    await run(() => storeFetch(`/api/store/carts/${c.id}/line-items`, { method: 'POST', body: { variantId, quantity } }))
    drawerOpen.value = true
  }

  const update = (lineId: string, quantity: number) =>
    run(() => storeFetch(`/api/store/carts/${cart.value!.id}/line-items/${lineId}`, { method: 'POST', body: { quantity } }))
  const remove = (lineId: string) => run(() => storeFetch(`/api/store/carts/${cart.value!.id}/line-items/${lineId}`, { method: 'DELETE' }))
  const applyCode = (code: string) => run(() => storeFetch(`/api/store/carts/${cart.value!.id}/promotions`, { method: 'POST', body: { code } }))
  const removeCode = (code: string) => run(() => storeFetch(`/api/store/carts/${cart.value!.id}/promotions/${encodeURIComponent(code)}`, { method: 'DELETE' }))
  const updateCart = (body: Record<string, unknown>) => run(() => storeFetch(`/api/store/carts/${cart.value!.id}`, { method: 'POST', body }))

  async function setRegion(regionId: string) {
    if (cart.value && cart.value.regionId !== regionId) await updateCart({ regionId })
  }

  function clear() {
    cookie.value = null
    cart.value = null
  }

  return { cart, drawerOpen, busy, error, notice, count, run, load, ensure, add, update, remove, applyCode, removeCode, updateCart, setRegion, clear }
})
