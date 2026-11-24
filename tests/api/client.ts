import { inject } from 'vitest'

export const baseURL = inject('baseURL')
export const hasServer = Boolean(baseURL)

export interface ApiResult<T = Record<string, unknown>> {
  status: number
  body: T
  headers: Headers
}

/** Minimal HTTP client with a cookie jar, so each test can act as a different browser. */
export class Client {
  private cookies = new Map<string, string>()
  constructor(private defaults: Record<string, string> = {}) {}

  async request<T = Record<string, unknown>>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
    const isForm = body instanceof FormData
    const res = await fetch(`${baseURL}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        origin: baseURL,
        ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
        ...(this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...this.defaults,
        ...headers,
      },
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      const [k, ...v] = pair!.split('=')
      const value = v.join('=')
      if (!value || /max-age=0/i.test(c)) this.cookies.delete(k!.trim())
      else this.cookies.set(k!.trim(), value)
    }
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      // non-JSON body
    }
    return { status: res.status, body: parsed as T, headers: res.headers }
  }

  get<T = Record<string, unknown>>(path: string, headers?: Record<string, string>) {
    return this.request<T>('GET', path, undefined, headers)
  }
  post<T = Record<string, unknown>>(path: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.request<T>('POST', path, body, headers)
  }
  patch<T = Record<string, unknown>>(path: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.request<T>('PATCH', path, body, headers)
  }
  delete<T = Record<string, unknown>>(path: string, headers?: Record<string, string>) {
    return this.request<T>('DELETE', path, undefined, headers)
  }
}
