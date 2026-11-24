import { eq, isNull } from 'drizzle-orm'
import { allCountries } from '#shared/utils/countries'
import { region, regionCountry } from '../../../db/schema'

/** Every country, with the region it's assigned to (if any). */
export default defineApiHandler(async (event) => {
  await requireAdmin(event)
  const assigned = await useDb()
    .select({ iso2: regionCountry.iso2, regionId: regionCountry.regionId, regionName: region.name })
    .from(regionCountry)
    .innerJoin(region, eq(region.id, regionCountry.regionId))
    .where(isNull(region.deletedAt))
  const byIso = new Map(assigned.map((a) => [a.iso2, a]))
  return { data: allCountries().map((c) => ({ ...c, regionId: byIso.get(c.iso2)?.regionId ?? null, regionName: byIso.get(c.iso2)?.regionName ?? null })) }
})
