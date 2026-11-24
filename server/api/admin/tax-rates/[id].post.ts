import { and, eq, isNull, ne } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { taxRateInputSchema } from '#shared/schemas/region'
import { taxRate } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: taxRateInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  const rate = await useTx(async (tx) => {
    const isDefault = body.isDefault && !body.productTypeId
    const [row] = await tx
      .update(taxRate)
      .set({ ...body, isDefault, productTypeId: body.productTypeId || null })
      .where(and(eq(taxRate.id, params.id), isNull(taxRate.deletedAt)))
      .returning()
    if (!row) throw notFound('Tax rate')
    if (isDefault) await tx.update(taxRate).set({ isDefault: false }).where(and(eq(taxRate.regionId, row.regionId), ne(taxRate.id, row.id)))
    return row
  })
  await audit(event, actor, 'tax_rate.updated', 'tax_rate', params.id, { rateBps: body.rateBps })
  return { taxRate: rate }
})
