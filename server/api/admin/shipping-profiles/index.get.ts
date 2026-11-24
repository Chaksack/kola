import { asc, isNull } from 'drizzle-orm'
import { shippingProfile } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  return { data: await useDb().select().from(shippingProfile).where(isNull(shippingProfile.deletedAt)).orderBy(asc(shippingProfile.createdAt)) }
})
