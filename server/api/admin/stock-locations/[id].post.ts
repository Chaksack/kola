import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { locationInputSchema } from '#shared/schemas/fulfillment'
import { stockLocation } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: locationInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb()
    .update(stockLocation)
    .set({ name: body.name, address: body.address ?? null })
    .where(and(eq(stockLocation.id, params.id), isNull(stockLocation.deletedAt)))
    .returning()
  if (!row) throw notFound('Location')
  await audit(event, actor, 'location.updated', 'stock_location', params.id)
  return { location: row }
})
