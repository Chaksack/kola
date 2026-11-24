import { valueInputSchema } from '#shared/schemas/catalog'
import { productTag } from '../../../db/schema'

export default defineValidatedHandler({ body: valueInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb()
    .insert(productTag)
    .values({ value: body.value })
    .onConflictDoUpdate({ target: productTag.value, set: { deletedAt: null } })
    .returning({ id: productTag.id, value: productTag.value })
  await audit(event, actor, 'productTag.created', 'productTag', row!.id)
  return { data: row }
})
