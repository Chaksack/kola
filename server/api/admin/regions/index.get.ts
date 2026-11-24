import { asc, inArray, isNull } from 'drizzle-orm'
import { region, regionCountry, regionPaymentProvider, taxRate } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const regions = await db.select().from(region).where(isNull(region.deletedAt)).orderBy(asc(region.createdAt))
  const ids = regions.map((r) => r.id)
  if (!ids.length) return { data: [] }
  const [countries, providers, rates] = await Promise.all([
    db.select().from(regionCountry).where(inArray(regionCountry.regionId, ids)).orderBy(asc(regionCountry.name)),
    db.select().from(regionPaymentProvider).where(inArray(regionPaymentProvider.regionId, ids)),
    db.select().from(taxRate).where(inArray(taxRate.regionId, ids)),
  ])
  return {
    data: regions.map((r) => ({
      ...r,
      countries: countries.filter((c) => c.regionId === r.id).map(({ iso2, name }) => ({ iso2, name })),
      paymentProviders: providers.filter((p) => p.regionId === r.id).map((p) => p.providerId),
      taxRates: rates.filter((x) => x.regionId === r.id && !x.deletedAt),
    })),
  }
})
