import { asc, eq, isNull } from 'drizzle-orm'
import { store, storeCurrency } from '../db/schema'

export async function storeCurrencies(): Promise<string[]> {
  const db = useDb()
  const [s] = await db.select({ id: store.id }).from(store).where(isNull(store.deletedAt)).limit(1)
  if (!s) return ['GHS']
  const rows = await db.select({ code: storeCurrency.currencyCode }).from(storeCurrency).where(eq(storeCurrency.storeId, s.id)).orderBy(asc(storeCurrency.currencyCode))
  return rows.map((r) => r.code)
}
