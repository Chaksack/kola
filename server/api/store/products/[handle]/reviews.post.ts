import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { product, productReview } from '../../../../db/schema'

/** Submit a review. It's held for moderation before it appears. */
export default defineValidatedHandler(
  {
    params: z.object({ handle: z.string().max(160) }),
    body: z.object({ authorName: z.string().trim().min(1).max(80), rating: z.number().int().min(1).max(5), title: z.string().trim().max(120).nullish(), body: z.string().trim().max(2000).nullish() }),
  },
  async (event, { params, body }) => {
    await requirePublishableKey(event)
    await rateLimit(event, 'review-submit', 5, 3600)
    const [p] = await useDb().select({ id: product.id }).from(product).where(and(eq(product.handle, params.handle), isNull(product.deletedAt), eq(product.status, 'published')))
    if (!p) throw notFound('Product')
    const customer = await getCustomer(event)
    await useDb().insert(productReview).values({ productId: p.id, customerId: customer?.id ?? null, authorName: body.authorName, rating: body.rating, title: body.title ?? null, body: body.body ?? null })
    return { ok: true, status: 'pending' }
  },
)
