import { asc, count, eq, isNull } from 'drizzle-orm'
import { customerGroup, customerGroupMember } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb()
    .select({ id: customerGroup.id, name: customerGroup.name, createdAt: customerGroup.createdAt, memberCount: count(customerGroupMember.customerId) })
    .from(customerGroup)
    .leftJoin(customerGroupMember, eq(customerGroupMember.groupId, customerGroup.id))
    .where(isNull(customerGroup.deletedAt))
    .groupBy(customerGroup.id)
    .orderBy(asc(customerGroup.name))
  return { data: rows }
})
