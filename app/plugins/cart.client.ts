export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    // Storefront only; the admin never needs the cart.
    if (!useRoute().path.startsWith('/admin')) void useCartStore().load()
  })
})
