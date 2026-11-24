import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { inventoryItemUpdateSchema } from '#shared/schemas/fulfillment'
import { inventoryItem, inventoryLevel } from '../../../db/schema'
import { updateLevel } from '../../../services/inventory'

export default defineValidatedHandler({ params: idParamSchema, body: inventoryItemUpdateSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  await useTx(async (tx) => {
    if (body.lowStockThreshold !== undefined) {
      const [row] = await tx.update(inventoryItem).set({ lowStockThreshold: body.lowStockThreshold }).where(eq(inventoryItem.id, params.id)).returning({ id: inventoryItem.id })
      if (!row) throw notFound('Inventory item')
    }
    for (const level of body.levels ?? []) await updateLevel(tx, params.id, level)
  })
  await audit(event, actor, 'inventory.adjusted', 'inventory_item', params.id, { levels: body.levels, lowStockThreshold: body.lowStockThreshold })
  const levels = await useDb().select().from(inventoryLevel).where(eq(inventoryLevel.inventoryItemId, params.id))
  return { id: params.id, levels: levels.map((l) => ({ locationId: l.locationId, stocked: l.stocked, reserved: l.reserved, incoming: l.incoming, available: l.stocked - l.reserved })) }
})
