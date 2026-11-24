import { eq, isNull } from 'drizzle-orm'
import { storeUpdateSchema } from '#shared/schemas/region'
import { currency, store, storeCurrency } from '../../../db/schema'

export default defineValidatedHandler({ body: storeUpdateSchema }, async (event, { body }) => {
  const actor = await requireAdmin(event, 'admin')
  const currencies = [...new Set([...body.currencies, body.defaultCurrencyCode])]
  await useTx(async (tx) => {
    const [row] = await tx.select({ id: store.id }).from(store).where(isNull(store.deletedAt)).limit(1)
    if (!row) throw notFound('Store')
    const known = await tx.select({ code: currency.code }).from(currency)
    const unknown = currencies.filter((c) => !known.some((k) => k.code === c))
    if (unknown.length) throw badRequest(`Unknown currency: ${unknown.join(', ')}`)
    await tx
      .update(store)
      .set({
        name: body.name,
        defaultCurrencyCode: body.defaultCurrencyCode,
        defaultRegionId: body.defaultRegionId || null,
        defaultLocationId: body.defaultLocationId || null,
        defaultSalesChannelId: body.defaultSalesChannelId || null,
      })
      .where(eq(store.id, row.id))
    await tx.delete(storeCurrency).where(eq(storeCurrency.storeId, row.id))
    await tx.insert(storeCurrency).values(currencies.map((c) => ({ storeId: row.id, currencyCode: c, isDefault: c === body.defaultCurrencyCode })))
  })
  await audit(event, actor, 'store.updated', 'store', null)
  return { ok: true }
})
