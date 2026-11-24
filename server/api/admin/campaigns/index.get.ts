import { count, desc, eq, isNull } from 'drizzle-orm'
import { campaign, promotion } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb()
    .select({ c: campaign, promotionCount: count(promotion.id) })
    .from(campaign)
    .leftJoin(promotion, eq(promotion.campaignId, campaign.id))
    .where(isNull(campaign.deletedAt))
    .groupBy(campaign.id)
    .orderBy(desc(campaign.createdAt))
  return { data: rows.map(({ c, promotionCount }) => ({ ...c, promotionCount })) }
})
