import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { serviceZoneInputSchema } from '#shared/schemas/fulfillment'
import { serviceZone, serviceZoneCountry, stockLocation } from '../../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: serviceZoneInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const zone = await useTx(async (tx) => {
    const [loc] = await tx.select({ id: stockLocation.id }).from(stockLocation).where(and(eq(stockLocation.id, params.id), isNull(stockLocation.deletedAt)))
    if (!loc) throw notFound('Location')
    const [row] = await tx.insert(serviceZone).values({ name: body.name, locationId: params.id }).returning()
    await tx.insert(serviceZoneCountry).values([...new Set(body.countries)].map((countryCode) => ({ serviceZoneId: row!.id, countryCode })))
    return row!
  })
  await audit(event, actor, 'service_zone.created', 'service_zone', zone.id)
  return { serviceZone: zone }
})
