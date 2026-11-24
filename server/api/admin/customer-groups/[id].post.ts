import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { groupInputSchema } from '#shared/schemas/marketing'
import { customerGroup } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: groupInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb().update(customerGroup).set(body).where(eq(customerGroup.id, params.id)).returning()
  if (!row) throw notFound('Customer group')
  await audit(event, actor, 'customer_group.updated', 'customer_group', params.id)
  return { group: row }
})
