import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { taxRateInputSchema } from '#shared/schemas/region'
import { region, taxRate } from '../../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: taxRateInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const rate = await useTx(async (tx) => {
    const [r] = await tx.select({ id: region.id }).from(region).where(and(eq(region.id, params.id), isNull(region.deletedAt)))
    if (!r) throw notFound('Region')
    // One default rate per region (product-type rates are overrides, never the default).
    const isDefault = body.isDefault && !body.productTypeId
    if (isDefault) await tx.update(taxRate).set({ isDefault: false }).where(eq(taxRate.regionId, params.id))
    const [row] = await tx.insert(taxRate).values({ ...body, isDefault, productTypeId: body.productTypeId || null, regionId: params.id }).returning()
    return row!
  })
  await audit(event, actor, 'tax_rate.created', 'tax_rate', rate.id, { rateBps: body.rateBps })
  return { taxRate: rate }
})
