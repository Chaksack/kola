import { and, count, desc, eq, ilike, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { apiKey, auditLog, user } from '../../../db/schema'

export default defineValidatedHandler(
  { query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0), action: z.string().max(80).optional(), resourceType: z.string().max(80).optional(), actorType: z.enum(['user', 'api_key', 'customer', 'system']).optional() }) },
  async (event, { query }) => {
    await requireAdmin(event, 'admin')
    const db = useDb()
    const where = and(query.action ? ilike(auditLog.action, `${query.action}%`) : undefined, query.resourceType ? eq(auditLog.resourceType, query.resourceType) : undefined, query.actorType ? eq(auditLog.actorType, query.actorType) : undefined)
    const [rows, [total]] = await Promise.all([db.select().from(auditLog).where(where).orderBy(desc(auditLog.createdAt)).limit(query.limit).offset(query.offset), db.select({ value: count() }).from(auditLog).where(where)])
    const userIds = [...new Set(rows.filter((r) => r.actorType === 'user' && r.actorId).map((r) => r.actorId!))]
    const keyIds = [...new Set(rows.filter((r) => r.actorType === 'api_key' && r.actorId).map((r) => r.actorId!))]
    const [users, keys] = await Promise.all([
      userIds.length ? db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, userIds)) : Promise.resolve([]),
      keyIds.length ? db.select({ id: apiKey.id, title: apiKey.title }).from(apiKey).where(inArray(apiKey.id, keyIds)) : Promise.resolve([]),
    ])
    return listResponse(
      rows.map((r) => ({ ...r, actorLabel: r.actorType === 'user' ? (users.find((u) => u.id === r.actorId)?.email ?? 'Deleted user') : r.actorType === 'api_key' ? `Key · ${keys.find((k) => k.id === r.actorId)?.title ?? r.actorId}` : r.actorType === 'system' ? 'System' : 'Customer' })),
      total?.value ?? 0,
      query.limit,
      query.offset,
    )
  },
)
