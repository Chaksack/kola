import { valueInputSchema } from '#shared/schemas/catalog'
import { productType } from '../../../db/schema'

export default defineValidatedHandler({ body: valueInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb()
    .insert(productType)
    .values({ value: body.value })
    .onConflictDoUpdate({ target: productType.value, set: { deletedAt: null } })
    .returning({ id: productType.id, value: productType.value })
  await audit(event, actor, 'productType.created', 'productType', row!.id)
  return { data: row }
})
