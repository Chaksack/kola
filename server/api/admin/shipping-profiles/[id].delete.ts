import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { product, shippingOption, shippingProfile } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  const db = useDb()
  const [profile] = await db.select().from(shippingProfile).where(and(eq(shippingProfile.id, params.id), isNull(shippingProfile.deletedAt)))
  if (!profile) throw notFound('Shipping profile')
  if (profile.type !== 'custom') throw conflict(`The ${profile.name} profile is built in and can't be deleted`)
  const [usedByProduct] = await db.select({ id: product.id }).from(product).where(and(eq(product.shippingProfileId, params.id), isNull(product.deletedAt))).limit(1)
  const [usedByOption] = await db.select({ id: shippingOption.id }).from(shippingOption).where(and(eq(shippingOption.shippingProfileId, params.id), isNull(shippingOption.deletedAt))).limit(1)
  if (usedByProduct || usedByOption) throw conflict('Products or shipping options still use this profile')
  await db.update(shippingProfile).set({ deletedAt: new Date() }).where(eq(shippingProfile.id, params.id))
  await audit(event, actor, 'shipping_profile.deleted', 'shipping_profile', params.id)
  return { id: params.id, deleted: true }
})
