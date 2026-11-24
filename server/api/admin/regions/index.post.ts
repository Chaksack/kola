import { regionInputSchema } from '#shared/schemas/region'
import { saveRegion } from '../../../services/region'

export default defineValidatedHandler({ body: regionInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  const id = await useTx((tx) => saveRegion(tx, body))
  await audit(event, actor, 'region.created', 'region', id, { name: body.name })
  return { region: { id } }
})
