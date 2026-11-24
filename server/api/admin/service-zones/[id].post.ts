import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { serviceZoneInputSchema } from '#shared/schemas/fulfillment'
import { serviceZone, serviceZoneCountry } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: serviceZoneInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const zone = await useTx(async (tx) => {
    const [row] = await tx.update(serviceZone).set({ name: body.name }).where(eq(serviceZone.id, params.id)).returning()
    if (!row) throw notFound('Service zone')
    await tx.delete(serviceZoneCountry).where(eq(serviceZoneCountry.serviceZoneId, params.id))
    await tx.insert(serviceZoneCountry).values([...new Set(body.countries)].map((countryCode) => ({ serviceZoneId: params.id, countryCode })))
    return row
  })
  await audit(event, actor, 'service_zone.updated', 'service_zone', params.id)
  return { serviceZone: zone }
})
