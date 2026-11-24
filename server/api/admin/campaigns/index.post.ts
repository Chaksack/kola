import { campaignInputSchema } from '#shared/schemas/marketing'
import { campaign } from '../../../db/schema'

export default defineValidatedHandler({ body: campaignInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb().insert(campaign).values(body).onConflictDoNothing().returning()
  if (!row) throw conflict('A campaign with this identifier exists')
  await audit(event, actor, 'campaign.created', 'campaign', row.id)
  return { campaign: row }
})
