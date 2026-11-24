import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { campaignInputSchema } from '#shared/schemas/marketing'
import { campaign } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: campaignInputSchema }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb().update(campaign).set(body).where(eq(campaign.id, params.id)).returning()
  if (!row) throw notFound('Campaign')
  await audit(event, actor, 'campaign.updated', 'campaign', params.id)
  return { campaign: row }
})
