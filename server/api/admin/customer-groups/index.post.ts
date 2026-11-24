import { groupInputSchema } from '#shared/schemas/marketing'
import { customerGroup } from '../../../db/schema'

export default defineValidatedHandler({ body: groupInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb().insert(customerGroup).values(body).onConflictDoNothing().returning()
  if (!row) throw conflict('A group with this name already exists')
  await audit(event, actor, 'customer_group.created', 'customer_group', row.id)
  return { group: row }
})
