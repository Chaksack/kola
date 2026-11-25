import type { H3Event } from 'h3'

/** Vercel Cron (or the GitHub Actions cron workflow) sends `Authorization: Bearer $CRON_SECRET`. Anything else is rejected. */
export function requireCron(event: H3Event) {
  const secret = useServerConfig().cronSecret
  const header = getHeader(event, 'authorization') ?? ''
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) throw apiError(401, 'unauthorized', 'Invalid cron credentials')
}

export async function runCronJob<T extends Record<string, unknown>>(event: H3Event, name: string, fn: () => Promise<T>) {
  requireCron(event)
  const started = Date.now()
  const result = await fn()
  await audit(event, { type: 'system', id: null }, `cron.${name}`, 'cron', name, { ...result, ms: Date.now() - started })
  return { job: name, ...result, ms: Date.now() - started }
}
