import { and, desc, inArray, isNull, sql } from 'drizzle-orm'
import { webhookDelivery, webhookEndpoint } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event, 'admin')
  const db = useDb()
  const rows = await db.select().from(webhookEndpoint).where(isNull(webhookEndpoint.deletedAt)).orderBy(desc(webhookEndpoint.createdAt))
  const ids = rows.map((r) => r.id)
  const stats = ids.length
    ? await db
        .select({ endpointId: webhookDelivery.endpointId, status: webhookDelivery.status, n: sql<number>`count(*)::int` })
        .from(webhookDelivery)
        .where(and(inArray(webhookDelivery.endpointId, ids), sql`${webhookDelivery.createdAt} > now() - interval '7 days'`))
        .groupBy(webhookDelivery.endpointId, webhookDelivery.status)
    : []
  return {
    data: rows.map(({ secretSalt: _s, secretHash: _h, ...r }) => ({
      ...r,
      last7Days: Object.fromEntries(stats.filter((s) => s.endpointId === r.id).map((s) => [s.status, s.n])),
    })),
  }
})
