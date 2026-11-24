import { count, desc, ilike, isNull, and } from 'drizzle-orm'
import { z } from 'zod'
import { giftCard } from '../../../db/schema'

export default defineValidatedHandler({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(20), offset: z.coerce.number().int().min(0).default(0), q: z.string().max(60).optional() }) }, async (event, { query }) => {
  await requireAdmin(event)
  const where = and(isNull(giftCard.deletedAt), query.q ? ilike(giftCard.code, `%${query.q}%`) : undefined)
  const [rows, [total]] = await Promise.all([useDb().select().from(giftCard).where(where).orderBy(desc(giftCard.createdAt)).limit(query.limit).offset(query.offset), useDb().select({ value: count() }).from(giftCard).where(where)])
  // Codes are bearer credentials: show only the last 4 characters in lists.
  return listResponse(rows.map((g) => ({ ...g, code: undefined, codeLast4: g.code.slice(-4) })), total?.value ?? 0, query.limit, query.offset)
})
