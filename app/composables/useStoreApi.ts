import type { NitroFetchOptions } from 'nitropack'
import { configValue } from '#shared/utils/config'

function storeHeaders(): Record<string, string> {
  const key = configValue(useRuntimeConfig().public.publishableKey)
  return key ? { 'x-publishable-api-key': key } : {}
}

/** $fetch against /api/store with the publishable key attached. */
export function storeFetch<T = unknown>(url: string, opts: NitroFetchOptions<string> = {}): Promise<T> {
  return $fetch<T, string>(url, { ...opts, headers: { ...storeHeaders(), ...(opts.headers as Record<string, string> | undefined) } }) as Promise<T>
}

/**
 * useFetch against /api/store with the publishable key attached. Registered as a keyed composable
 * in nuxt.config so each call site still gets its own auto-generated key.
 */
export const useStoreFetch = ((url: Parameters<typeof useFetch>[0], opts: Record<string, unknown> = {}, ...rest: unknown[]) =>
  // @ts-expect-error -- forwarding the generic overloads of useFetch; types come from `typeof useFetch`.
  useFetch(url, { ...opts, headers: { ...storeHeaders(), ...(opts.headers as Record<string, string> | undefined) } }, ...rest)) as unknown as typeof useFetch
