import { asc, eq, isNull } from 'drizzle-orm'
import { currency, store, storeCurrency } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const [row] = await db.select().from(store).where(isNull(store.deletedAt)).limit(1)
  if (!row) throw notFound('Store')
  const currencies = await db
    .select({ code: currency.code, name: currency.name, symbol: currency.symbol, decimals: currency.decimals, isDefault: storeCurrency.isDefault })
    .from(storeCurrency)
    .innerJoin(currency, eq(currency.code, storeCurrency.currencyCode))
    .where(eq(storeCurrency.storeId, row.id))
    .orderBy(asc(currency.code))
  return { store: { ...row, currencies } }
})
