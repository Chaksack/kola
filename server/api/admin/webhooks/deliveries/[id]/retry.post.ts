import { eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { webhookDelivery } from '../../../../../db/schema'
import { attemptDelivery } from '../../../../../services/webhooks'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requireAdmin(event, 'admin')
  const db = useDb()
  const [d] = await db.update(webhookDelivery).set({ status: 'pending' }).where(eq(webhookDelivery.id, params.id)).returning()
  if (!d) throw notFound('Delivery')
  return { outcome: await attemptDelivery(db, d, { serverKey: webhookKey() }) }
})
