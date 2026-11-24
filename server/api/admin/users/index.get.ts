import { and, asc, count, ilike, isNull, or } from 'drizzle-orm'
import { listQuerySchema } from '#shared/schemas/common'
import { user } from '../../../db/schema'

export default defineValidatedHandler({ query: listQuerySchema }, async (event, { query }) => {
  await requireAdmin(event)
  const db = useDb()
  const where = and(
    isNull(user.deletedAt),
    query.q ? or(ilike(user.email, `%${query.q}%`), ilike(user.firstName, `%${query.q}%`), ilike(user.lastName, `%${query.q}%`)) : undefined,
  )
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt })
      .from(user)
      .where(where)
      .orderBy(asc(user.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(user).where(where),
  ])
  return listResponse(rows, total?.value ?? 0, query.limit, query.offset)
})
