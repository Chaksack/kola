import { asc, inArray, isNull } from 'drizzle-orm'
import { regionCountry, serviceZone, serviceZoneCountry, shippingOption, shippingOptionPrice, shippingProfile, stockLocation, store } from '../../../db/schema'

/** Everything Settings › Locations & shipping needs in one round trip. */
export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const [locations, profiles, [storeRow], countries] = await Promise.all([
    db.select().from(stockLocation).where(isNull(stockLocation.deletedAt)).orderBy(asc(stockLocation.createdAt)),
    db.select().from(shippingProfile).where(isNull(shippingProfile.deletedAt)).orderBy(asc(shippingProfile.createdAt)),
    db.select({ defaultLocationId: store.defaultLocationId }).from(store).limit(1),
    db.select({ iso2: regionCountry.iso2, name: regionCountry.name }).from(regionCountry).orderBy(asc(regionCountry.name)),
  ])
  const locIds = locations.map((l) => l.id)
  const zones = locIds.length ? await db.select().from(serviceZone).where(inArray(serviceZone.locationId, locIds)).orderBy(asc(serviceZone.createdAt)) : []
  const zoneIds = zones.map((z) => z.id)
  const [zoneCountries, options] = await Promise.all([
    zoneIds.length ? db.select().from(serviceZoneCountry).where(inArray(serviceZoneCountry.serviceZoneId, zoneIds)) : Promise.resolve([]),
    zoneIds.length ? db.select().from(shippingOption).where(inArray(shippingOption.serviceZoneId, zoneIds)).orderBy(asc(shippingOption.createdAt)) : Promise.resolve([]),
  ])
  const liveOptions = options.filter((o) => !o.deletedAt)
  const prices = liveOptions.length ? await db.select().from(shippingOptionPrice).where(inArray(shippingOptionPrice.shippingOptionId, liveOptions.map((o) => o.id))) : []
  return {
    defaultLocationId: storeRow?.defaultLocationId ?? null,
    countries,
    profiles,
    locations: locations.map((l) => ({
      ...l,
      serviceZones: zones
        .filter((z) => z.locationId === l.id)
        .map((z) => ({
          ...z,
          countries: zoneCountries.filter((c) => c.serviceZoneId === z.id).map((c) => c.countryCode),
          shippingOptions: liveOptions
            .filter((o) => o.serviceZoneId === z.id)
            .map((o) => ({ ...o, prices: prices.filter((p) => p.shippingOptionId === o.id).map(({ currencyCode, regionId, amount }) => ({ currencyCode, regionId, amount })) })),
        })),
    })),
  }
})
