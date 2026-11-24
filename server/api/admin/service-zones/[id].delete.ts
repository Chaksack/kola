import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { serviceZone } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  // Shipping options in the zone cascade; carts and orders keep their own snapshot of the method.
  const [row] = await useDb().delete(serviceZone).where(eq(serviceZone.id, params.id)).returning({ id: serviceZone.id })
  if (!row) throw notFound('Service zone')
  await audit(event, actor, 'service_zone.deleted', 'service_zone', params.id)
  return { id: params.id, deleted: true }
})
