import type { ApiErrorBody } from '#shared/schemas/common'

interface FetchLikeError {
  data?: Partial<ApiErrorBody>
  statusCode?: number
  message?: string
}

/** Human message from a failed $fetch call. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as FetchLikeError
  return e?.data?.message || fallback
}

export function apiErrorCode(err: unknown): string | undefined {
  return (err as FetchLikeError)?.data?.code
}

/** Map `details: [{ path, message }]` from validation errors onto form fields. */
export function apiFieldErrors(err: unknown): Record<string, string> {
  const details = (err as FetchLikeError)?.data?.details
  const out: Record<string, string> = {}
  if (Array.isArray(details)) {
    for (const d of details as { path?: string; message?: string }[]) {
      if (d.path && d.message && !out[d.path]) out[d.path] = d.message
    }
  }
  return out
}
