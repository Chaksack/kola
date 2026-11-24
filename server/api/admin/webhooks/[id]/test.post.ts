import { and, eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { webhookDelivery } from '../../../../db/schema'
import { attemptDelivery } from '../../../../services/webhooks'
import { newId } from '#shared/utils/id'

/** Send a `ping` delivery to one endpoint and return the result. */
export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requireAdmin(event, 'admin')
  const db = useDb()
  const id = newId('evt')
  const [d] = await db.insert(webhookDelivery).values({ endpointId: params.id, eventId: id, eventName: 'ping', payload: { id, type: 'ping', created_at: new Date().toISOString(), data: {} }, nextAttemptAt: new Date() }).returning()
  const outcome = await attemptDelivery(db, d!, { serverKey: webhookKey() })
  const [row] = await db.select().from(webhookDelivery).where(and(eq(webhookDelivery.id, d!.id)))
  return { outcome, delivery: row }
})
