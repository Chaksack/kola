import { shippingProfileInputSchema } from '#shared/schemas/fulfillment'
import { shippingProfile } from '../../../db/schema'

export default defineValidatedHandler({ body: shippingProfileInputSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  const [row] = await useDb().insert(shippingProfile).values(body).returning()
  await audit(event, actor, 'shipping_profile.created', 'shipping_profile', row!.id)
  return { profile: row }
})
