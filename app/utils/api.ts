import type { NitroFetchOptions } from 'nitropack'

/**
 * $fetch for dynamic URLs. Nitro's typed routes try to match template-literal URLs against every
 * route and can exceed TypeScript's depth limit; this skips that inference.
 */
export function api<T = unknown>(url: string, opts: NitroFetchOptions<string> = {}): Promise<T> {
  return $fetch<T, string>(url, opts) as Promise<T>
}
