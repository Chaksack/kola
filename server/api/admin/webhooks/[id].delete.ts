import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { webhookEndpoint } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().update(webhookEndpoint).set({ deletedAt: new Date(), status: 'disabled' }).where(eq(webhookEndpoint.id, params.id)).returning({ id: webhookEndpoint.id })
  if (!row) throw notFound('Webhook')
  await audit(event, actor, 'webhook.deleted', 'webhook', params.id)
  return { id: params.id, deleted: true }
})
