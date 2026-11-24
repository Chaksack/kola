import { and, eq, isNull } from 'drizzle-orm'
import { idParamSchema } from '#shared/schemas/common'
import { region, regionCountry, store } from '../../../db/schema'

export default defineValidatedHandler({ params: idParamSchema }, async (event, { params }) => {
  const actor = await requireAdmin(event, 'admin')
  await useTx(async (tx) => {
    const [isDefault] = await tx.select({ id: store.id }).from(store).where(eq(store.defaultRegionId, params.id))
    if (isDefault) throw conflict('This is the default region. Pick another default in Store settings first.')
    const [row] = await tx.update(region).set({ deletedAt: new Date() }).where(and(eq(region.id, params.id), isNull(region.deletedAt))).returning({ id: region.id })
    if (!row) throw notFound('Region')
    // Release its countries so another region can sell there.
    await tx.update(regionCountry).set({ regionId: null }).where(eq(regionCountry.regionId, params.id))
  })
  await audit(event, actor, 'region.deleted', 'region', params.id)
  return { id: params.id, deleted: true }
})
