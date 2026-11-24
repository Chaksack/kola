import { desc, eq } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { webhookDelivery } from '../../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  await requireAdmin(event, 'admin')
  const rows = await useDb().select().from(webhookDelivery).where(eq(webhookDelivery.endpointId, params.id)).orderBy(desc(webhookDelivery.createdAt)).limit(50)
  return { data: rows }
})
