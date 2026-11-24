import { locationInputSchema } from '#shared/schemas/fulfillment'
import { stockLocation } from '../../../db/schema'

export default defineValidatedHandler({ body: locationInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().insert(stockLocation).values({ name: body.name, address: body.address ?? null }).returning()
  await audit(event, actor, 'location.created', 'stock_location', row!.id)
  return { location: row }
})
