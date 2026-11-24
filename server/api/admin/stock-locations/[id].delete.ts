import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { inventoryLevel, stockLocation, store } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const db = useDb()
  const [isDefault] = await db.select({ id: store.id }).from(store).where(eq(store.defaultLocationId, params.id))
  if (isDefault) throw conflict('This is the default location. Pick another default in Store settings first.')
  const [held] = await db
    .select({ id: inventoryLevel.id })
    .from(inventoryLevel)
    .where(and(eq(inventoryLevel.locationId, params.id), or(gt(inventoryLevel.stocked, 0), gt(inventoryLevel.reserved, 0))))
    .limit(1)
  if (held) throw conflict('This location still holds or reserves stock. Move or zero it first.')
  const [row] = await db.update(stockLocation).set({ deletedAt: new Date() }).where(and(eq(stockLocation.id, params.id), isNull(stockLocation.deletedAt))).returning({ id: stockLocation.id })
  if (!row) throw notFound('Location')
  await audit(event, actor, 'location.deleted', 'stock_location', params.id)
  return { id: params.id, deleted: true }
})
