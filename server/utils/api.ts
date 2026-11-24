import type { H3Event } from 'h3'
import { ZodError, type z, type ZodType } from 'zod'
import type { ApiErrorBody, ListResponse } from '#shared/schemas/common'

/** Throw this (or `apiError(...)`) from any handler; the wrapper turns it into `{ code, message, details }`. */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const apiError = (statusCode: number, code: string, message: string, details?: unknown) =>
  new ApiError(statusCode, code, message, details)
export const notFound = (what: string) => apiError(404, 'not_found', `${what} not found`)
export const badRequest = (message: string, details?: unknown) => apiError(400, 'invalid_request', message, details)
export const conflict = (message: string, details?: unknown) => apiError(409, 'conflict', message, details)

function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

/** Normalize anything thrown into the API error shape and set the status. */
export function toErrorBody(event: H3Event, err: unknown): ApiErrorBody {
  let status = 500
  let body: ApiErrorBody = { code: 'internal_error', message: 'Something went wrong' }
  if (err instanceof ApiError) {
    status = err.statusCode
    body = { code: err.code, message: err.message, details: err.details }
  } else if (err instanceof ZodError) {
    status = 400
    body = { code: 'validation_error', message: 'Request is invalid', details: zodDetails(err) }
  } else if (isError(err)) {
    status = err.statusCode
    const data = (err.data ?? {}) as { code?: string; details?: unknown }
    body = { code: data.code ?? codeForStatus(status), message: err.statusMessage || err.message, details: data.details }
  } else {
    // Unknown errors never leak internals. Log the error object only (no request bodies).
    console.error('[api]', event.method, event.path, err)
  }
  if (status >= 500 && !(err instanceof ApiError)) console.error('[api]', event.method, event.path, err)
  setResponseStatus(event, status)
  if (body.details === undefined) delete body.details
  return body
}

function codeForStatus(status: number): string {
  return (
    { 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed', 409: 'conflict', 413: 'payload_too_large', 415: 'unsupported_media_type', 422: 'unprocessable', 429: 'rate_limited' }[status] ??
    (status >= 500 ? 'internal_error' : 'error')
  )
}

/** Wrap a handler so every error becomes `{ code, message, details }` with the right status. */
export function defineApiHandler<T>(fn: (event: H3Event) => Promise<T> | T) {
  return defineEventHandler(async (event) => {
    try {
      return await fn(event)
    } catch (err) {
      // Typed as `never` so the error shape doesn't pollute inferred response types on the client.
      return toErrorBody(event, err) as never
    }
  })
}

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType }
type Infer<S> = S extends ZodType ? z.output<S> : undefined
export type ValidatedInput<S extends Schemas> = { body: Infer<S['body']>; query: Infer<S['query']>; params: Infer<S['params']> }

/**
 * Validate body, query and route params with zod before the handler runs.
 *   export default defineValidatedHandler({ body: schema }, async (event, { body }) => { ... })
 */
export function defineValidatedHandler<S extends Schemas, T>(
  schemas: S,
  fn: (event: H3Event, input: ValidatedInput<S>) => Promise<T> | T,
) {
  return defineApiHandler(async (event) => {
    const input = {
      body: schemas.body ? schemas.body.parse((await readBody(event).catch(() => undefined)) ?? {}) : undefined,
      query: schemas.query ? schemas.query.parse(getQuery(event)) : undefined,
      params: schemas.params ? schemas.params.parse(getRouterParams(event, { decode: true })) : undefined,
    } as ValidatedInput<S>
    return fn(event, input)
  })
}

export function listResponse<T>(data: T[], count: number, limit: number, offset: number): ListResponse<T> {
  return { data, count, limit, offset }
}
