const loading = new Map<string, Promise<void>>()

/** Load a third-party script once (Paystack inline, Stripe.js). Allowed by the CSP in nuxt.config. */
export function loadScript(src: string): Promise<void> {
  if (!import.meta.client) return Promise.resolve()
  let p = loading.get(src)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script')
      el.src = src
      el.async = true
      el.onload = () => resolve()
      el.onerror = () => {
        loading.delete(src)
        reject(new Error(`Could not load ${src}`))
      }
      document.head.appendChild(el)
    })
    loading.set(src, p)
  }
  return p
}
