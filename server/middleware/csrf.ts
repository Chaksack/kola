/**
 * CSRF protection for cookie-authenticated mutations. Session cookies are SameSite=Lax; on top of
 * that, any unsafe /api request that carries the session cookie must come from our own origin.
 * Requests authenticated another way (Bearer secret keys, signed webhooks, cron) are exempt.
 */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
const EXEMPT = ['/api/webhooks/', '/api/cron/']

export default defineEventHandler((event) => {
  if (SAFE.has(event.method) || !event.path.startsWith('/api/')) return
  if (EXEMPT.some((p) => event.path.startsWith(p))) return
  if (/^Bearer\s/i.test(getHeader(event, 'authorization') ?? '')) return
  const cookieName = useRuntimeConfig().session.name ?? 'nuxt-session'
  if (!getCookie(event, cookieName)) return

  const sourceHost = hostOf(getHeader(event, 'origin') ?? getHeader(event, 'referer'))
  const allowed = new Set([getRequestHost(event, { xForwardedHost: true })])
  const storeHost = hostOf(useServerConfig().storeUrl)
  if (storeHost) allowed.add(storeHost)
  if (!sourceHost || !allowed.has(sourceHost)) {
    setResponseStatus(event, 403)
    return { code: 'csrf_failed', message: 'Cross-site request blocked' }
  }
})

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
