import type { H3Event } from 'h3'
import { sql } from 'drizzle-orm'
import { rateLimit as rateLimitTable } from '../db/schema'

/**
 * Fixed-window rate limit stored in Postgres (no in-memory state, so it works across serverless
 * instances). One upsert per call.
 */
export async function rateLimit(event: H3Event, bucket: string, limit: number, windowSeconds: number, subject?: string) {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const key = `${bucket}:${subject ?? ip}`
  const expired = sql`${rateLimitTable.windowStart} < now() - make_interval(secs => ${Math.floor(windowSeconds)})`
  const [row] = await useDb()
    .insert(rateLimitTable)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: rateLimitTable.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimitTable.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${rateLimitTable.windowStart} end`,
      },
    })
    .returning({ count: rateLimitTable.count, windowStart: rateLimitTable.windowStart })
  if (row && row.count > limit) {
    const resetIn = Math.ceil((row.windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000)
    setResponseHeader(event, 'Retry-After', Math.max(1, resetIn))
    throw apiError(429, 'rate_limited', 'Too many requests. Try again shortly.')
  }
}
