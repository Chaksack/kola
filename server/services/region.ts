import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import type { Tx } from '../db/client'
import * as t from '../db/schema'
import { countryName } from '../../shared/utils/countries'
import { badRequest, conflict, notFound } from './errors'

export interface RegionInput {
  name: string
  currencyCode: string
  taxInclusive: boolean
  automaticTaxes: boolean
  countries: string[]
  paymentProviders: string[]
  defaultTaxRate?: { name: string; code: string; rateBps: number }
}

/** Create or update a region. A country can belong to only one region. */
export async function saveRegion(tx: Tx, input: RegionInput, id?: string): Promise<string> {
  const [cur] = await tx.select({ code: t.currency.code }).from(t.currency).where(eq(t.currency.code, input.currencyCode))
  if (!cur) throw badRequest(`Currency ${input.currencyCode} is not enabled`, [{ path: 'currencyCode', message: 'Unknown currency' }])
  const countries = [...new Set(input.countries)]
  if (countries.length) {
    const taken = await tx
      .select({ iso2: t.regionCountry.iso2, regionName: t.region.name })
      .from(t.regionCountry)
      .innerJoin(t.region, eq(t.region.id, t.regionCountry.regionId))
      .where(and(inArray(t.regionCountry.iso2, countries), isNull(t.region.deletedAt), id ? ne(t.regionCountry.regionId, id) : undefined))
    if (taken.length) {
      throw conflict(`${taken.map((x) => `${countryName(x.iso2)} (${x.regionName})`).join(', ')} already belong to another region`, [{ path: 'countries', message: 'Country already in another region' }])
    }
  }
  const fields = { name: input.name, currencyCode: input.currencyCode, taxInclusive: input.taxInclusive, automaticTaxes: input.automaticTaxes }
  let regionId = id
  if (regionId) {
    const [row] = await tx.update(t.region).set(fields).where(and(eq(t.region.id, regionId), isNull(t.region.deletedAt))).returning({ id: t.region.id })
    if (!row) throw notFound('Region')
  } else {
    regionId = (await tx.insert(t.region).values(fields).returning({ id: t.region.id }))[0]!.id
  }
  const rid = regionId

  await tx.update(t.regionCountry).set({ regionId: null }).where(eq(t.regionCountry.regionId, rid))
  for (const iso2 of countries) {
    await tx.insert(t.regionCountry).values({ iso2, name: countryName(iso2), regionId: rid }).onConflictDoUpdate({ target: t.regionCountry.iso2, set: { regionId: rid } })
  }
  await tx.delete(t.regionPaymentProvider).where(eq(t.regionPaymentProvider.regionId, rid))
  if (input.paymentProviders.length) await tx.insert(t.regionPaymentProvider).values([...new Set(input.paymentProviders)].map((providerId) => ({ regionId: rid, providerId })))
  if (input.defaultTaxRate) await tx.insert(t.taxRate).values({ ...input.defaultTaxRate, regionId: rid, isDefault: true })
  return rid
}
