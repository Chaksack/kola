import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { idParamSchema } from '#shared/schemas/common'
import { productReview } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema, body: z.object({ status: z.enum(['pending', 'approved', 'rejected']) }) }, async (event, { params, body }) => {
  const actor = await requireAdmin(event)
  const [row] = await useDb().update(productReview).set({ status: body.status }).where(eq(productReview.id, params.id)).returning({ id: productReview.id })
  if (!row) throw notFound('Review')
  await audit(event, actor, `review.${body.status}`, 'review', params.id)
  return { id: params.id, status: body.status }
})
