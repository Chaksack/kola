import { salesChannelInputSchema } from '#shared/schemas/region'
import { salesChannel } from '../../../db/schema'

export default defineValidatedHandler({ body: salesChannelInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().insert(salesChannel).values(body).returning()
  await audit(event, actor, 'sales_channel.created', 'sales_channel', row!.id)
  return { salesChannel: row }
})
