import { and, eq, inArray } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { groupMembersSchema } from '#shared/schemas/marketing'
import { customerGroupMember } from '../../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: groupMembersSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  await useTx(async (tx) => {
    if (body.add.length) await tx.insert(customerGroupMember).values(body.add.map((customerId) => ({ customerId, groupId: params.id }))).onConflictDoNothing()
    if (body.remove.length) await tx.delete(customerGroupMember).where(and(eq(customerGroupMember.groupId, params.id), inArray(customerGroupMember.customerId, body.remove)))
  })
  await audit(event, actor, 'customer_group.members_changed', 'customer_group', params.id, { added: body.add.length, removed: body.remove.length })
  return { ok: true }
})
