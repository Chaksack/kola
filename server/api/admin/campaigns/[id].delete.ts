import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { campaign, promotion } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  await useTx(async (tx) => {
    await tx.update(promotion).set({ campaignId: null }).where(eq(promotion.campaignId, params.id))
    const [row] = await tx.update(campaign).set({ deletedAt: new Date(), identifier: `deleted-${params.id}` }).where(eq(campaign.id, params.id)).returning({ id: campaign.id })
    if (!row) throw notFound('Campaign')
  })
  await audit(event, actor, 'campaign.deleted', 'campaign', params.id)
  return { id: params.id, deleted: true }
})
