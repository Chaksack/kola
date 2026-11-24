/** Errors services can throw without depending on Nitro. API handlers render them as `{ code, message, details }`. */
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
