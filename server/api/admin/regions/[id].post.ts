import { idParamSchema } from '#shared/schemas/common'
import { regionInputSchema } from '#shared/schemas/region'
import { saveRegion } from '../../../services/region'

export default defineValidatedHandler({ params: idParamSchema, body: regionInputSchema.omit({ defaultTaxRate: true }) }, async (event, { params, body }) => {
  const actor = await requireAdmin(event, 'admin')
  await useTx((tx) => saveRegion(tx, body, params.id))
  await audit(event, actor, 'region.updated', 'region', params.id)
  return { region: { id: params.id } }
})
