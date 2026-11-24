import { asc, inArray, isNull } from 'drizzle-orm'
import { region, regionCountry, regionPaymentProvider } from '../../../db/schema'

export default defineApiHandler(async (event) => {
  await requirePublishableKey(event)
  const db = useDb()
  const regions = await db.select({ id: region.id, name: region.name, currencyCode: region.currencyCode, taxInclusive: region.taxInclusive }).from(region).where(isNull(region.deletedAt)).orderBy(asc(region.createdAt))
  const ids = regions.map((r) => r.id)
  const [countries, providers] = ids.length
    ? await Promise.all([db.select().from(regionCountry).where(inArray(regionCountry.regionId, ids)).orderBy(asc(regionCountry.name)), db.select().from(regionPaymentProvider).where(inArray(regionPaymentProvider.regionId, ids))])
    : [[], []]
  const cfg = useServerConfig()
  const configured = (p: string) => (p === 'manual' ? true : p.startsWith('paystack') ? Boolean(cfg.paystackSecretKey) : p === 'stripe' ? Boolean(cfg.stripeSecretKey) : false)
  return {
    defaultRegionId: await defaultRegionId(),
    data: regions.map((r) => ({
      ...r,
      countries: countries.filter((c) => c.regionId === r.id).map(({ iso2, name }) => ({ iso2, name })),
      paymentProviders: providers.filter((p) => p.regionId === r.id && configured(p.providerId)).map((p) => p.providerId),
    })),
  }
})
