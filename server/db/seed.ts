/**
 * `pnpm db:seed`: creates the "Kola Market" demo store. Runs in one transaction and refuses to run
 * twice (use `pnpm db:reset` to start over).
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { count, eq, sql } from 'drizzle-orm'
import { closeDb, createDb, type Tx } from './client'
import { hashPasswordStandalone } from './password'
import * as t from './schema'
import { computeTotals } from '../services/totals'
import { allocate, applyBps } from '../../shared/utils/money'
import { newId } from '../../shared/utils/id'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const adminEmail = process.env.ADMIN_SEED_EMAIL
const adminPassword = process.env.ADMIN_SEED_PASSWORD
if (!adminEmail || !adminPassword) throw new Error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD are required')

const CURRENCIES = ['GHS', 'USD', 'EUR', 'GBP'] as const
type Cur = (typeof CURRENCIES)[number]

const daysAgo = (d: number, h = 10) => {
  const date = new Date()
  date.setDate(date.getDate() - d)
  date.setHours(h, (d * 7) % 60, 0, 0)
  return date
}

interface ProductSeed {
  title: string
  handle: string
  subtitle: string
  description: string
  type: string
  collection: string | null
  categories: string[]
  tags: string[]
  options: { title: string; values: string[] }[]
  /** Price per currency in minor units, for each variant in option-matrix order (or one for all). */
  prices: Record<Cur, number[]>
  /** Stock per variant at [Tema, Osu]. Omit for not-tracked products. */
  stock?: [number, number][]
  giftcard?: boolean
  weight?: number
  material?: string
}

const PRODUCTS: ProductSeed[] = [
  {
    title: 'Kente Weave Tote',
    handle: 'kente-weave-tote',
    subtitle: 'Handwoven in Bonwire',
    description:
      'A structured tote cut from strip-woven kente cloth, lined in cotton canvas with a leather base. Each strip is woven on a narrow loom in Bonwire, so no two bags carry quite the same pattern.',
    type: 'Accessories',
    collection: 'harmattan-edit',
    categories: ['bags'],
    tags: ['handmade', 'kente'],
    options: [{ title: 'Colour', values: ['Gold', 'Indigo'] }],
    prices: { GHS: [45000], USD: [3900], EUR: [3600], GBP: [3100] },
    stock: [
      [24, 6],
      [18, 4],
    ],
    weight: 650,
    material: 'Cotton, leather',
  },
  {
    title: 'Shea Body Butter 250ml',
    handle: 'shea-body-butter-250ml',
    subtitle: 'Unrefined, from Tamale cooperatives',
    description:
      'Grade A unrefined shea butter, whipped with a little coconut oil so it melts on contact. Sourced from women-led cooperatives in the Northern Region.',
    type: 'Beauty',
    collection: 'harmattan-edit',
    categories: ['beauty'],
    tags: ['natural', 'shea'],
    options: [{ title: 'Scent', values: ['Unscented', 'Lemongrass', 'Frankincense'] }],
    prices: { GHS: [12000], USD: [1200], EUR: [1100], GBP: [950] },
    stock: [
      [120, 30],
      [64, 12],
      [3, 0],
    ],
    weight: 280,
  },
  {
    title: 'Adinkra Linen Shirt',
    handle: 'adinkra-linen-shirt',
    subtitle: 'Hand-stamped Adinkra symbols',
    description:
      'A relaxed camp-collar shirt in mid-weight linen, hand-stamped with Gye Nyame and Sankofa symbols using calabash stamps and badie ink.',
    type: 'Apparel',
    collection: 'harmattan-edit',
    categories: ['shirts'],
    tags: ['linen', 'adinkra'],
    options: [
      { title: 'Size', values: ['S', 'M', 'L', 'XL'] },
      { title: 'Colour', values: ['Natural', 'Charcoal'] },
    ],
    prices: { GHS: [68000], USD: [5800], EUR: [5400], GBP: [4600] },
    stock: [
      [8, 2],
      [6, 2],
      [12, 3],
      [10, 3],
      [9, 2],
      [7, 1],
      [4, 0],
      [0, 0],
    ],
    weight: 320,
    material: 'Linen',
  },
  {
    title: 'Ceramic Pour-Over Set',
    handle: 'ceramic-pour-over-set',
    subtitle: 'Dripper, carafe and two cups',
    description:
      'Wheel-thrown stoneware from a studio in Vume. The dripper takes standard #2 filters; the carafe holds 600ml.',
    type: 'Home',
    collection: 'home-and-table',
    categories: ['kitchen'],
    tags: ['ceramic', 'coffee'],
    options: [{ title: 'Finish', values: ['Matte white', 'Glazed clay'] }],
    prices: { GHS: [89000], USD: [7500], EUR: [6900], GBP: [5900] },
    stock: [
      [14, 3],
      [9, 2],
    ],
    weight: 1800,
    material: 'Stoneware',
  },
  {
    title: 'Single-Origin Cocoa Nibs',
    handle: 'single-origin-cocoa-nibs',
    subtitle: 'Roasted in small batches, Ashanti Region',
    description:
      'Fermented, sun-dried and lightly roasted cocoa nibs from a single farm near Konongo. Bright, fruity, no sugar added.',
    type: 'Pantry',
    collection: 'pantry',
    categories: ['pantry'],
    tags: ['cocoa', 'single-origin'],
    options: [{ title: 'Size', values: ['250g', '500g'] }],
    prices: { GHS: [9500, 17000], USD: [900, 1600], EUR: [850, 1500], GBP: [750, 1300] },
    stock: [
      [80, 20],
      [40, 10],
    ],
    weight: 300,
  },
  {
    title: 'Batik Silk Scarf',
    handle: 'batik-silk-scarf',
    subtitle: 'Wax-resist dyed in Aburi',
    description: 'A 90cm square of habotai silk, wax-resist dyed by hand. Hand-rolled edges.',
    type: 'Apparel',
    collection: 'harmattan-edit',
    categories: ['scarves'],
    tags: ['silk', 'batik'],
    options: [{ title: 'Pattern', values: ['Sunrise', 'Lagoon'] }],
    prices: { GHS: [52000], USD: [4500], EUR: [4200], GBP: [3600] },
    stock: [
      [11, 2],
      [5, 1],
    ],
    weight: 80,
    material: 'Silk',
  },
  {
    title: 'Woven Market Basket',
    handle: 'woven-market-basket',
    subtitle: 'Bolga elephant grass, leather handles',
    description:
      'The classic Bolgatanga basket: tightly woven elephant grass with a hand-stitched leather handle. Sturdy enough for a full market run.',
    type: 'Home',
    collection: 'home-and-table',
    categories: ['baskets'],
    tags: ['handmade', 'bolga'],
    options: [{ title: 'Size', values: ['Small', 'Large'] }],
    prices: { GHS: [26000, 38000], USD: [2200, 3200], EUR: [2000, 3000], GBP: [1800, 2600] },
    stock: [
      [16, 4],
      [10, 3],
    ],
    weight: 900,
    material: 'Elephant grass, leather',
  },
  {
    title: 'Holiday Gift Card',
    handle: 'holiday-gift-card',
    subtitle: 'Delivered by email',
    description: 'A Kola Market gift card, delivered by email with a personal note. Never expires.',
    type: 'Gift card',
    collection: null,
    categories: [],
    tags: ['gift'],
    options: [{ title: 'Amount', values: ['GH₵100', 'GH₵250', 'GH₵500'] }],
    prices: {
      GHS: [10000, 25000, 50000],
      USD: [900, 2200, 4400],
      EUR: [800, 2000, 4000],
      GBP: [700, 1800, 3500],
    },
    giftcard: true,
  },
]

/** Cartesian product of option values, in order. */
function matrix(options: { values: string[] }[]): number[][] {
  return options.reduce<number[][]>(
    (acc, o) => acc.flatMap((combo) => o.values.map((_, i) => [...combo, i])),
    [[]],
  )
}

async function seed(tx: Tx) {
  const [{ value: existing } = { value: 0 }] = await tx.select({ value: count() }).from(t.store)
  if (existing > 0) throw new Error('Database is already seeded. Run `pnpm db:reset` to start over.')

  // ── Currencies & store ────────────────────────────────────────────────
  await tx.insert(t.currency).values([
    { code: 'GHS', name: 'Ghanaian cedi', symbol: 'GH₵', decimals: 2 },
    { code: 'USD', name: 'US dollar', symbol: '$', decimals: 2 },
    { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
    { code: 'GBP', name: 'Pound sterling', symbol: '£', decimals: 2 },
  ])

  // ── Regions ──────────────────────────────────────────────────────────
  const regionDefs = [
    { key: 'gh', name: 'Ghana', currencyCode: 'GHS', taxInclusive: true, rate: 1500, taxName: 'VAT', providers: ['paystack', 'paystack-momo', 'manual'], countries: [['gh', 'Ghana']] },
    { key: 'wa', name: 'West Africa', currencyCode: 'USD', taxInclusive: false, rate: 0, taxName: 'No tax', providers: ['stripe', 'paystack'], countries: [['ng', 'Nigeria'], ['ci', "Côte d'Ivoire"], ['sn', 'Senegal'], ['tg', 'Togo'], ['bj', 'Benin']] },
    { key: 'eu', name: 'Europe', currencyCode: 'EUR', taxInclusive: true, rate: 2000, taxName: 'VAT', providers: ['stripe'], countries: [['de', 'Germany'], ['fr', 'France'], ['nl', 'Netherlands'], ['es', 'Spain'], ['it', 'Italy'], ['be', 'Belgium'], ['ie', 'Ireland'], ['pt', 'Portugal']] },
    { key: 'uk', name: 'United Kingdom', currencyCode: 'GBP', taxInclusive: true, rate: 2000, taxName: 'VAT', providers: ['stripe'], countries: [['gb', 'United Kingdom']] },
  ] as const
  const regions: Record<string, typeof t.region.$inferSelect & { rate: number }> = {}
  for (const r of regionDefs) {
    const [row] = await tx
      .insert(t.region)
      .values({ name: r.name, currencyCode: r.currencyCode, taxInclusive: r.taxInclusive })
      .returning()
    regions[r.key] = { ...row!, rate: r.rate }
    await tx.insert(t.regionCountry).values(r.countries.map(([iso2, name]) => ({ iso2, name, regionId: row!.id })))
    await tx.insert(t.regionPaymentProvider).values(r.providers.map((providerId) => ({ regionId: row!.id, providerId })))
    await tx.insert(t.taxRate).values({ regionId: row!.id, name: r.taxName, code: r.taxName.toUpperCase().replace(/\s/g, '_'), rateBps: r.rate })
  }
  const gh = regions.gh!

  // ── Sales channels & publishable keys ────────────────────────────────
  const channelRows = await tx
    .insert(t.salesChannel)
    .values([
      { name: 'Web store', description: 'kola.market storefront' },
      { name: 'Mobile app', description: 'iOS and Android apps' },
      { name: 'POS · Osu', description: 'Oxford Street shop' },
      { name: 'POS · Tema', description: 'Warehouse counter' },
      { name: 'Wholesale', description: 'Trade accounts', isDisabled: true },
    ])
    .returning()
  const [web, mobile, posOsu, posTema] = channelRows as [typeof t.salesChannel.$inferSelect, ...(typeof t.salesChannel.$inferSelect)[]]
  const pkToken = process.env.NUXT_PUBLIC_PUBLISHABLE_KEY || `pk_${randomBytes(24).toString('hex')}`
  const [pk] = await tx
    .insert(t.apiKey)
    .values({ title: 'Web storefront', type: 'publishable', token: pkToken, redacted: `${pkToken.slice(0, 6)}…${pkToken.slice(-4)}` })
    .returning()
  await tx.insert(t.apiKeySalesChannel).values({ apiKeyId: pk!.id, salesChannelId: web.id })

  // ── Locations, shipping ──────────────────────────────────────────────
  const [tema, osu] = (await tx
    .insert(t.stockLocation)
    .values([
      { name: 'Tema warehouse', address: { address1: 'Community 2, Harbour Road', city: 'Tema', province: 'Greater Accra', countryCode: 'gh', phone: '+233302000111' } },
      { name: 'Osu store', address: { address1: '14 Oxford Street', city: 'Accra', province: 'Greater Accra', countryCode: 'gh', phone: '+233302000222' } },
    ])
    .returning()) as [typeof t.stockLocation.$inferSelect, typeof t.stockLocation.$inferSelect]

  const [defaultProfile, giftProfile] = (await tx
    .insert(t.shippingProfile)
    .values([
      { name: 'Default', type: 'default' },
      { name: 'Gift cards', type: 'gift_card' },
    ])
    .returning()) as [typeof t.shippingProfile.$inferSelect, typeof t.shippingProfile.$inferSelect]

  const [zoneGh, zoneIntl, zonePickup] = (await tx
    .insert(t.serviceZone)
    .values([
      { name: 'Ghana', locationId: tema.id },
      { name: 'International', locationId: tema.id },
      { name: 'Accra pickup', locationId: osu.id },
    ])
    .returning()) as [typeof t.serviceZone.$inferSelect, typeof t.serviceZone.$inferSelect, typeof t.serviceZone.$inferSelect]
  await tx.insert(t.serviceZoneCountry).values([
    { serviceZoneId: zoneGh.id, countryCode: 'gh' },
    { serviceZoneId: zonePickup.id, countryCode: 'gh' },
    ...regionDefs.filter((r) => r.key !== 'gh').flatMap((r) => r.countries.map(([c]) => ({ serviceZoneId: zoneIntl.id, countryCode: c }))),
  ])

  const shipping = {
    standard: await insertShippingOption(tx, { name: 'Standard delivery', serviceZoneId: zoneGh.id, shippingProfileId: defaultProfile.id, description: '2–4 working days' }, [['GHS', 3000]]),
    express: await insertShippingOption(tx, { name: 'Express · Accra & Tema', serviceZoneId: zoneGh.id, shippingProfileId: defaultProfile.id, description: 'Same or next day' }, [['GHS', 6000]]),
    pickup: await insertShippingOption(tx, { name: 'Pick up at Osu store', serviceZoneId: zonePickup.id, shippingProfileId: defaultProfile.id, description: 'Ready in 2 hours' }, [['GHS', 0]]),
    intl: await insertShippingOption(tx, { name: 'International standard', serviceZoneId: zoneIntl.id, shippingProfileId: defaultProfile.id, description: '7–12 working days' }, [['USD', 2500], ['EUR', 2200], ['GBP', 2000]]),
    email: await insertShippingOption(tx, { name: 'Email delivery', serviceZoneId: zoneGh.id, shippingProfileId: giftProfile.id, description: 'Gift cards' }, [['GHS', 0]]),
  }
  await insertShippingOption(tx, { name: 'Return to Tema warehouse', serviceZoneId: zoneGh.id, shippingProfileId: defaultProfile.id, isReturn: true, adminOnly: true }, [['GHS', 0]])

  // ── Store ────────────────────────────────────────────────────────────
  const [store] = await tx
    .insert(t.store)
    .values({ name: 'Kola Market', defaultCurrencyCode: 'GHS', defaultRegionId: gh.id, defaultLocationId: tema.id, defaultSalesChannelId: web.id })
    .returning()
  await tx.insert(t.storeCurrency).values(CURRENCIES.map((c) => ({ storeId: store!.id, currencyCode: c, isDefault: c === 'GHS' })))

  // ── Catalog taxonomy ─────────────────────────────────────────────────
  const typeRows = await tx
    .insert(t.productType)
    .values([...new Set(PRODUCTS.map((p) => p.type))].map((value) => ({ value })))
    .returning()
  const typeId = Object.fromEntries(typeRows.map((r) => [r.value, r.id]))

  const tagRows = await tx
    .insert(t.productTag)
    .values([...new Set(PRODUCTS.flatMap((p) => p.tags))].map((value) => ({ value })))
    .returning()
  const tagId = Object.fromEntries(tagRows.map((r) => [r.value, r.id]))

  const collectionRows = await tx
    .insert(t.productCollection)
    .values([
      { title: 'Harmattan Edit', handle: 'harmattan-edit', description: 'Dry-season essentials, made in Ghana.' },
      { title: 'Home & Table', handle: 'home-and-table', description: 'Ceramics, baskets and things for the table.' },
      { title: 'Pantry', handle: 'pantry', description: 'Single-origin cocoa and other good things to eat.' },
    ])
    .returning()
  const collectionId = Object.fromEntries(collectionRows.map((r) => [r.handle, r.id]))

  const catIds: Record<string, string> = {}
  const addCat = async (name: string, handle: string, parent: string | null, rank: number) => {
    const [row] = await tx.insert(t.productCategory).values({ name, handle, parentId: parent ? catIds[parent] : null, rank }).returning()
    catIds[handle] = row!.id
  }
  await addCat('Apparel', 'apparel', null, 0)
  await addCat('Shirts', 'shirts', 'apparel', 0)
  await addCat('Scarves', 'scarves', 'apparel', 1)
  await addCat('Home', 'home', null, 1)
  await addCat('Kitchen', 'kitchen', 'home', 0)
  await addCat('Baskets', 'baskets', 'home', 1)
  await addCat('Accessories', 'accessories', null, 2)
  await addCat('Bags', 'bags', 'accessories', 0)
  await addCat('Beauty', 'beauty', null, 3)
  await addCat('Pantry', 'pantry', null, 4)

  // ── Products ─────────────────────────────────────────────────────────
  interface SeededVariant {
    id: string
    title: string
    sku: string
    productId: string
    productTitle: string
    productHandle: string
    inventoryItemId: string | null
    prices: Record<Cur, number>
  }
  const variantsByHandle: Record<string, SeededVariant[]> = {}

  for (const [pi, p] of PRODUCTS.entries()) {
    const [prod] = await tx
      .insert(t.product)
      .values({
        title: p.title,
        handle: p.handle,
        subtitle: p.subtitle,
        description: p.description,
        status: 'published',
        isGiftcard: p.giftcard ?? false,
        discountable: !p.giftcard,
        weight: p.weight,
        material: p.material,
        originCountry: 'gh',
        typeId: typeId[p.type],
        collectionId: p.collection ? collectionId[p.collection] : null,
        shippingProfileId: p.giftcard ? giftProfile.id : defaultProfile.id,
        seoTitle: `${p.title} · Kola Market`,
        seoDescription: p.subtitle,
        createdAt: daysAgo(60 - pi * 3),
      })
      .returning()
    const productId = prod!.id

    if (p.categories.length) await tx.insert(t.productCategoryProduct).values(p.categories.map((c) => ({ categoryId: catIds[c]!, productId })))
    await tx.insert(t.productTagLink).values(p.tags.map((tag) => ({ productId, tagId: tagId[tag]! })))
    const channels = p.giftcard ? [web, mobile] : [web, mobile, posOsu, posTema]
    await tx.insert(t.productSalesChannel).values(channels.map((c) => ({ productId, salesChannelId: c!.id })))

    const optionValueIds: string[][] = []
    for (const [oi, o] of p.options.entries()) {
      const [opt] = await tx.insert(t.productOption).values({ productId, title: o.title, rank: oi }).returning()
      const vals = await tx
        .insert(t.productOptionValue)
        .values(o.values.map((value, rank) => ({ optionId: opt!.id, value, rank })))
        .returning()
      optionValueIds.push(vals.map((v) => v.id))
    }

    const combos = matrix(p.options)
    const seeded: SeededVariant[] = []
    for (const [vi, combo] of combos.entries()) {
      const title = combo.map((ci, oi) => p.options[oi]!.values[ci]).join(' / ')
      const skuSuffix = combo.map((ci, oi) => p.options[oi]!.values[ci]!.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()).join('-')
      const sku = `${p.handle.split('-').map((w) => w[0]).join('').toUpperCase()}-${skuSuffix}`
      const [variant] = await tx
        .insert(t.productVariant)
        .values({ productId, title, sku, manageInventory: !p.giftcard, rank: vi, weight: p.weight })
        .returning()
      await tx.insert(t.variantOptionValue).values(combo.map((ci, oi) => ({ variantId: variant!.id, optionValueId: optionValueIds[oi]![ci]! })))

      const [pset] = await tx.insert(t.priceSet).values({ variantId: variant!.id }).returning()
      const prices = Object.fromEntries(CURRENCIES.map((c) => [c, p.prices[c][vi] ?? p.prices[c][0]!])) as Record<Cur, number>
      await tx.insert(t.price).values(CURRENCIES.map((c) => ({ priceSetId: pset!.id, amount: prices[c], currencyCode: c })))

      let inventoryItemId: string | null = null
      if (p.stock) {
        const [item] = await tx.insert(t.inventoryItem).values({ variantId: variant!.id, sku }).returning()
        inventoryItemId = item!.id
        const [atTema, atOsu] = p.stock[vi] ?? [0, 0]
        await tx.insert(t.inventoryLevel).values([
          { inventoryItemId: item!.id, locationId: tema.id, stocked: atTema, incoming: atTema < 5 ? 12 : 0 },
          { inventoryItemId: item!.id, locationId: osu.id, stocked: atOsu },
        ])
      }
      seeded.push({ id: variant!.id, title, sku, productId, productTitle: p.title, productHandle: p.handle, inventoryItemId, prices })
    }
    variantsByHandle[p.handle] = seeded
  }

  // ── Customers ────────────────────────────────────────────────────────
  const groupRows = await tx.insert(t.customerGroup).values([{ name: 'VIP' }, { name: 'Wholesale' }, { name: 'Staff' }]).returning()
  const groupId = Object.fromEntries(groupRows.map((g) => [g.name, g.id]))
  const customerPassword = await hashPasswordStandalone('kola-demo-1234')
  const customerDefs = [
    { first: 'Ama', last: 'Owusu', email: 'ama.owusu@example.com', phone: '+233244100200', account: true, groups: ['VIP'], city: 'Accra', addr: '21 Ring Road East, Osu', country: 'gh' },
    { first: 'Kwame', last: 'Mensah', email: 'kwame.mensah@example.com', phone: '+233201112233', account: true, groups: [], city: 'Kumasi', addr: '8 Prempeh II Street', country: 'gh' },
    { first: 'Efua', last: 'Boateng', email: 'efua.boateng@example.com', phone: '+233555667788', account: true, groups: ['VIP', 'Staff'], city: 'Tema', addr: 'Community 11, House 42', country: 'gh' },
    { first: 'Yaw', last: 'Darko', email: 'yaw.darko@example.com', phone: '+233277889900', account: false, groups: [], city: 'Takoradi', addr: '3 Market Circle', country: 'gh' },
    { first: 'Abena', last: 'Asante', email: 'abena.asante@example.com', phone: '+233266554433', account: true, groups: ['Wholesale'], city: 'Accra', addr: '17 Spintex Road', country: 'gh' },
    { first: 'Chidi', last: 'Okafor', email: 'chidi.okafor@example.com', phone: '+2348031234567', account: true, groups: [], city: 'Lagos', addr: '12 Admiralty Way, Lekki', country: 'ng' },
    { first: 'Claire', last: 'Dubois', email: 'claire.dubois@example.com', phone: '+33612345678', account: false, groups: [], city: 'Paris', addr: '45 Rue de la Roquette', country: 'fr' },
    { first: 'Oliver', last: 'Hughes', email: 'oliver.hughes@example.com', phone: '+447700900123', account: true, groups: [], city: 'London', addr: '9 Brixton Station Road', country: 'gb' },
  ]
  const customers: Record<string, typeof t.customer.$inferSelect & { address: typeof t.customerAddress.$inferSelect }> = {}
  for (const [i, c] of customerDefs.entries()) {
    const [row] = await tx
      .insert(t.customer)
      .values({ email: c.email, firstName: c.first, lastName: c.last, phone: c.phone, hasAccount: c.account, passwordHash: c.account ? customerPassword : null, createdAt: daysAgo(90 - i * 9) })
      .returning()
    const [addr] = await tx
      .insert(t.customerAddress)
      .values({ customerId: row!.id, label: 'Home', firstName: c.first, lastName: c.last, address1: c.addr, city: c.city, countryCode: c.country, phone: c.phone, isDefaultShipping: true, isDefaultBilling: true })
      .returning()
    if (c.groups.length) await tx.insert(t.customerGroupMember).values(c.groups.map((g) => ({ customerId: row!.id, groupId: groupId[g]! })))
    customers[c.first.toLowerCase()] = { ...row!, address: addr! }
  }

  // ── Promotions, price lists, reasons ─────────────────────────────────
  const [campaign] = await tx
    .insert(t.campaign)
    .values({ name: 'Harmattan 2026', identifier: 'harmattan-2026', description: 'Dry-season campaign', startsAt: daysAgo(30), endsAt: daysAgo(-60), budgetType: 'usage', budgetLimit: 500, budgetUsed: 1 })
    .returning()
  const [harmattan] = await tx
    .insert(t.promotion)
    .values({ code: 'HARMATTAN10', type: 'standard', status: 'active', campaignId: campaign!.id, applicationType: 'percentage', value: 1000, targetType: 'order', allocation: 'across', usageCount: 1 })
    .returning()
  const [freeShip] = await tx
    .insert(t.promotion)
    .values({ code: 'FREESHIPGH', type: 'standard', status: 'active', applicationType: 'percentage', value: 10000, targetType: 'shipping', allocation: 'across' })
    .returning()
  await tx.insert(t.promotionRule).values([
    { promotionId: freeShip!.id, ruleType: 'condition', attribute: 'region', operator: 'in', values: [gh.id] },
    { promotionId: freeShip!.id, ruleType: 'condition', attribute: 'min_subtotal', operator: 'gte', values: ['100000'] },
  ])
  await tx
    .insert(t.promotion)
    .values({ code: 'STAFF20', type: 'standard', status: 'draft', applicationType: 'percentage', value: 2000, targetType: 'items', allocation: 'each' })

  const [saleList] = await tx
    .insert(t.priceList)
    .values({ title: 'Harmattan sale', description: '15% off linen and silk', type: 'sale', status: 'active', startsAt: daysAgo(7), endsAt: daysAgo(-21) })
    .returning()
  const saleVariants = [...variantsByHandle['batik-silk-scarf']!]
  for (const v of saleVariants) {
    const [pset] = await tx.select({ id: t.priceSet.id }).from(t.priceSet).where(eqVariant(v.id))
    await tx.insert(t.price).values({ priceSetId: pset!.id, priceListId: saleList!.id, amount: Math.round((v.prices.GHS * 85) / 100), currencyCode: 'GHS' })
  }
  const [wholesaleList] = await tx
    .insert(t.priceList)
    .values({ title: 'Wholesale', description: 'Trade pricing for wholesale accounts', type: 'override', status: 'draft' })
    .returning()
  await tx.insert(t.priceListCustomerGroup).values({ priceListId: wholesaleList!.id, customerGroupId: groupId.Wholesale! })

  const reasonRows = await tx
    .insert(t.returnReason)
    .values([
      { value: 'wrong_size', label: 'Wrong size' },
      { value: 'damaged', label: 'Arrived damaged' },
      { value: 'not_as_described', label: 'Not as described' },
      { value: 'changed_mind', label: 'Changed my mind' },
    ])
    .returning()

  // ── Admin user ───────────────────────────────────────────────────────
  const [owner] = await tx
    .insert(t.user)
    .values({ email: adminEmail!.toLowerCase(), firstName: 'Kola', lastName: 'Owner', role: 'owner', passwordHash: await hashPasswordStandalone(adminPassword!) })
    .returning()
  const ownerName = 'Kola Owner'

  // ── Orders in every status ───────────────────────────────────────────
  type Scenario = {
    customer: string
    region: 'gh' | 'wa' | 'eu' | 'uk'
    channel: typeof web
    items: [handle: string, variantIndex: number, qty: number][]
    ship: keyof typeof shipping
    provider: string
    payment: t.PaymentStatus
    fulfillment: t.FulfillmentStatus
    status?: t.OrderStatus
    promo?: 'HARMATTAN10'
    day: number
  }
  const scenarios: Scenario[] = [
    { customer: 'ama', region: 'gh', channel: web, items: [['kente-weave-tote', 0, 1], ['shea-body-butter-250ml', 1, 2]], ship: 'standard', provider: 'paystack', payment: 'captured', fulfillment: 'not_fulfilled', promo: 'HARMATTAN10', day: 0 },
    { customer: 'kwame', region: 'gh', channel: mobile!, items: [['single-origin-cocoa-nibs', 1, 2]], ship: 'standard', provider: 'manual', payment: 'awaiting', fulfillment: 'not_fulfilled', day: 1 },
    { customer: 'efua', region: 'gh', channel: web, items: [['adinkra-linen-shirt', 2, 1]], ship: 'express', provider: 'paystack-momo', payment: 'authorized', fulfillment: 'not_fulfilled', day: 1 },
    { customer: 'abena', region: 'gh', channel: posOsu!, items: [['woven-market-basket', 1, 1], ['ceramic-pour-over-set', 0, 1]], ship: 'pickup', provider: 'manual', payment: 'captured', fulfillment: 'delivered', status: 'completed', day: 2 },
    { customer: 'yaw', region: 'gh', channel: web, items: [['batik-silk-scarf', 0, 1], ['shea-body-butter-250ml', 0, 1]], ship: 'standard', provider: 'paystack', payment: 'captured', fulfillment: 'shipped', day: 3 },
    { customer: 'chidi', region: 'wa', channel: web, items: [['kente-weave-tote', 1, 2]], ship: 'intl', provider: 'stripe', payment: 'captured', fulfillment: 'partially_fulfilled', day: 4 },
    { customer: 'claire', region: 'eu', channel: web, items: [['ceramic-pour-over-set', 1, 1]], ship: 'intl', provider: 'stripe', payment: 'refunded', fulfillment: 'canceled', status: 'canceled', day: 6 },
    { customer: 'oliver', region: 'uk', channel: web, items: [['adinkra-linen-shirt', 5, 1], ['single-origin-cocoa-nibs', 0, 1]], ship: 'intl', provider: 'stripe', payment: 'partially_refunded', fulfillment: 'delivered', status: 'completed', day: 9 },
    { customer: 'ama', region: 'gh', channel: web, items: [['holiday-gift-card', 1, 1]], ship: 'email', provider: 'paystack', payment: 'captured', fulfillment: 'delivered', status: 'completed', day: 12 },
    { customer: 'kwame', region: 'gh', channel: posTema!, items: [['woven-market-basket', 0, 2]], ship: 'pickup', provider: 'manual', payment: 'captured', fulfillment: 'delivered', status: 'completed', day: 15 },
    { customer: 'efua', region: 'gh', channel: mobile!, items: [['shea-body-butter-250ml', 2, 1]], ship: 'standard', provider: 'paystack', payment: 'requires_action', fulfillment: 'not_fulfilled', status: 'requires_action', day: 18 },
    { customer: 'abena', region: 'gh', channel: web, items: [['adinkra-linen-shirt', 1, 3]], ship: 'standard', provider: 'paystack', payment: 'not_paid', fulfillment: 'not_fulfilled', day: 21 },
    { customer: 'oliver', region: 'uk', channel: web, items: [['kente-weave-tote', 0, 1]], ship: 'intl', provider: 'stripe', payment: 'captured', fulfillment: 'partially_shipped', day: 24 },
    { customer: 'ama', region: 'gh', channel: web, items: [['ceramic-pour-over-set', 0, 1]], ship: 'express', provider: 'paystack', payment: 'captured', fulfillment: 'delivered', status: 'completed', day: 40 },
  ]

  for (const s of scenarios) {
    const region = regions[s.region]!
    const cur = region.currencyCode as Cur
    const cus = customers[s.customer]!
    const lines = s.items.map(([handle, vi, qty]) => {
      const v = variantsByHandle[handle]![vi]!
      return { v, qty, unitPrice: v.prices[cur] }
    })
    const shipOpt = shipping[s.ship]
    const shipAmount = shipOpt.prices[cur] ?? 0
    const itemsGross = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0)
    const orderDiscount = s.promo ? applyBps(itemsGross, harmattan!.value) : 0
    // Allocate the order-level discount across lines in proportion to their value.
    const discounts = allocate(orderDiscount, lines.map((l) => l.unitPrice * l.qty))
    const totals = computeTotals({
      items: lines.map((l, i) => ({ id: String(i), unitPrice: l.unitPrice, quantity: l.qty, taxRateBps: region.rate, isTaxInclusive: region.taxInclusive, discount: discounts[i] })),
      shippingMethods: [{ id: 'ship', amount: shipAmount, taxRateBps: region.rate, isTaxInclusive: region.taxInclusive }],
    })
    const createdAt = daysAgo(s.day, 9 + (s.day % 8))
    const captured = ['captured', 'partially_refunded', 'refunded'].includes(s.payment)
    const refunded = s.payment === 'refunded' ? totals.total : s.payment === 'partially_refunded' ? totals.items[0]!.total : 0
    const address = {
      firstName: cus.firstName,
      lastName: cus.lastName,
      address1: cus.address.address1,
      city: cus.address.city,
      countryCode: cus.address.countryCode,
      phone: cus.phone,
    }

    const orderId = newId('order')
    const cartId = newId('cart')
    const [ord] = await tx
      .insert(t.order)
      .values({
        id: orderId,
        status: s.status ?? 'pending',
        paymentStatus: s.payment,
        fulfillmentStatus: s.fulfillment,
        regionId: region.id,
        salesChannelId: s.channel.id,
        customerId: cus.id,
        email: cus.email,
        currencyCode: cur,
        cartId,
        shippingAddress: address,
        billingAddress: address,
        isTaxInclusive: region.taxInclusive,
        itemSubtotal: totals.itemSubtotal,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        shippingTotal: totals.shippingTotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        paidTotal: captured ? totals.total : 0,
        refundedTotal: refunded,
        promoCodes: s.promo ? [s.promo] : [],
        canceledAt: s.status === 'canceled' ? daysAgo(s.day - 1) : null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    const fulfilledShare = (qty: number) => {
      switch (s.fulfillment) {
        case 'fulfilled':
        case 'shipped':
        case 'delivered':
          return qty
        case 'partially_fulfilled':
        case 'partially_shipped':
        case 'partially_delivered':
          return Math.max(1, Math.floor(qty / 2))
        default:
          return 0
      }
    }
    const shippedStates = ['shipped', 'delivered', 'partially_shipped', 'partially_delivered']
    const itemRows = await tx
      .insert(t.orderItem)
      .values(
        lines.map((l, i) => {
          const lt = totals.items[i]!
          const fq = fulfilledShare(l.qty)
          return {
            orderId,
            variantId: l.v.id,
            productId: l.v.productId,
            title: l.v.productTitle,
            variantTitle: l.v.title,
            sku: l.v.sku,
            quantity: l.qty,
            fulfilledQuantity: fq,
            shippedQuantity: shippedStates.includes(s.fulfillment) ? fq : 0,
            deliveredQuantity: s.fulfillment === 'delivered' ? fq : 0,
            returnedQuantity: s.payment === 'partially_refunded' && i === 0 ? l.qty : 0,
            unitPrice: l.unitPrice,
            subtotal: lt.subtotal,
            discountTotal: lt.discountTotal,
            taxTotal: lt.taxTotal,
            total: lt.total,
            taxRateBps: region.rate,
            isTaxInclusive: region.taxInclusive,
            requiresShipping: !l.v.productHandle.includes('gift'),
            isGiftcard: l.v.productHandle.includes('gift'),
            createdAt,
          }
        }),
      )
      .returning()
    await tx.insert(t.orderShippingMethod).values({ orderId, shippingOptionId: shipOpt.id, name: shipOpt.name, amount: shipAmount, taxTotal: totals.shippingTaxTotal, createdAt })

    // Payment
    const [paycol] = await tx
      .insert(t.paymentCollection)
      .values({
        cartId,
        orderId,
        currencyCode: cur,
        amount: totals.total,
        authorizedAmount: ['authorized', 'captured', 'partially_refunded', 'refunded'].includes(s.payment) ? totals.total : 0,
        capturedAmount: captured ? totals.total : 0,
        refundedAmount: refunded,
        status: captured ? 'completed' : s.payment === 'authorized' ? 'authorized' : 'awaiting',
        createdAt,
      })
      .returning()
    const ref = `${s.provider === 'stripe' ? 'pi' : 'T'}${randomBytes(6).toString('hex')}`
    const [pay] = await tx
      .insert(t.payment)
      .values({
        paymentCollectionId: paycol!.id,
        orderId,
        providerId: s.provider,
        amount: totals.total,
        currencyCode: cur,
        capturedAmount: captured ? totals.total : 0,
        refundedAmount: refunded,
        providerReference: ref,
        capturedAt: captured ? createdAt : null,
        createdAt,
      })
      .returning()

    const events: (typeof t.orderEvent.$inferInsert)[] = [
      { orderId, type: 'order.placed', message: `Order placed on ${s.channel.name}`, tone: 'neutral', actorType: 'customer', actorId: cus.id, actorName: `${cus.firstName} ${cus.lastName}`, createdAt },
    ]
    const trx: (typeof t.orderTransaction.$inferInsert)[] = []
    if (['authorized', 'captured', 'partially_refunded', 'refunded'].includes(s.payment)) {
      trx.push({ orderId, paymentId: pay!.id, kind: 'authorization', amount: totals.total, currencyCode: cur, providerId: s.provider, reference: ref, createdAt })
      events.push({ orderId, type: 'payment.authorized', message: 'Payment authorized', tone: 'warn', createdAt })
    }
    if (captured) {
      trx.push({ orderId, paymentId: pay!.id, kind: 'capture', amount: totals.total, currencyCode: cur, providerId: s.provider, reference: ref, createdAt })
      events.push({ orderId, type: 'payment.captured', message: 'Payment captured', tone: 'ok', createdAt })
    }
    if (s.payment === 'requires_action') events.push({ orderId, type: 'payment.requires_action', message: 'Customer has not completed 3-D Secure', tone: 'warn', createdAt })

    // Fulfillment
    const fulfilledLines = itemRows.filter((r) => r.fulfilledQuantity > 0)
    if (fulfilledLines.length) {
      const location = s.ship === 'pickup' ? osu : tema
      const shipped = shippedStates.includes(s.fulfillment)
      const fulAt = new Date(createdAt.getTime() + 6 * 3600_000)
      const [ful] = await tx
        .insert(t.fulfillment)
        .values({
          orderId,
          locationId: location.id,
          shippingOptionId: shipOpt.id,
          packedAt: fulAt,
          shippedAt: shipped ? new Date(fulAt.getTime() + 12 * 3600_000) : null,
          deliveredAt: s.fulfillment === 'delivered' ? new Date(fulAt.getTime() + 48 * 3600_000) : null,
          createdAt: fulAt,
        })
        .returning()
      await tx.insert(t.fulfillmentItem).values(
        fulfilledLines.map((r) => ({
          fulfillmentId: ful!.id,
          orderItemId: r.id,
          inventoryItemId: lines.find((l) => l.v.id === r.variantId)?.v.inventoryItemId ?? null,
          title: r.title,
          sku: r.sku,
          quantity: r.fulfilledQuantity,
        })),
      )
      events.push({ orderId, type: 'fulfillment.created', message: `Fulfillment created from ${location.name}`, tone: 'info', actorType: 'user', actorId: owner!.id, actorName: ownerName, createdAt: fulAt })
      if (shipped) {
        await tx.insert(t.fulfillmentTracking).values({ fulfillmentId: ful!.id, trackingNumber: `GH${randomBytes(4).toString('hex').toUpperCase()}`, carrier: s.region === 'gh' ? 'Kola Dispatch' : 'DHL Express' })
        events.push({ orderId, type: 'fulfillment.shipped', message: 'Marked as shipped', tone: 'info', actorType: 'user', actorId: owner!.id, actorName: ownerName, createdAt: ful!.shippedAt! })
      }
      if (s.fulfillment === 'delivered') events.push({ orderId, type: 'fulfillment.delivered', message: 'Delivered', tone: 'ok', createdAt: ful!.deliveredAt! })
    }

    // Reserve stock for anything not yet fulfilled on live orders
    if (s.status !== 'canceled') {
      for (const r of itemRows) {
        const open = r.quantity - r.fulfilledQuantity
        const inv = lines.find((l) => l.v.id === r.variantId)?.v.inventoryItemId
        if (open > 0 && inv) {
          await tx.insert(t.reservation).values({ inventoryItemId: inv, locationId: tema.id, quantity: open, orderId, orderItemId: r.id, description: `Order ${ord!.displayId}` })
          await tx.execute(sqlReserve(inv, tema.id, open))
        }
      }
    }

    if (refunded > 0) {
      const ret = s.payment === 'partially_refunded'
        ? (await tx.insert(t.orderReturn).values({ orderId, status: 'received', locationId: tema.id, refundAmount: refunded, receivedAt: daysAgo(s.day - 4) }).returning())[0]
        : undefined
      if (ret) {
        await tx.insert(t.returnItem).values({ returnId: ret.id, orderItemId: itemRows[0]!.id, quantity: itemRows[0]!.quantity, receivedQuantity: itemRows[0]!.quantity, reasonId: reasonRows[0]!.id })
        events.push({ orderId, type: 'return.received', message: 'Return received at Tema warehouse', tone: 'neutral', actorType: 'user', actorId: owner!.id, actorName: ownerName, createdAt: daysAgo(s.day - 4) })
      }
      await tx.insert(t.refund).values({ orderId, paymentId: pay!.id, returnId: ret?.id, amount: refunded, currencyCode: cur, reason: ret ? 'return' : 'canceled', createdBy: owner!.id, createdAt: daysAgo(s.day - 4) })
      trx.push({ orderId, paymentId: pay!.id, kind: 'refund', amount: -refunded, currencyCode: cur, providerId: s.provider, createdAt: daysAgo(s.day - 4) })
      events.push({ orderId, type: 'payment.refunded', message: `Refunded ${(refunded / 100).toFixed(2)} ${cur}`, tone: 'neutral', actorType: 'user', actorId: owner!.id, actorName: ownerName, createdAt: daysAgo(s.day - 4) })
    }
    if (s.status === 'canceled') events.push({ orderId, type: 'order.canceled', message: 'Order canceled at customer request', tone: 'neutral', actorType: 'user', actorId: owner!.id, actorName: ownerName, createdAt: daysAgo(s.day - 1) })
    if (s.customer === 'ama' && s.day === 0) events.push({ orderId, type: 'note', message: 'Customer asked for gift wrapping on the tote.', tone: 'neutral', actorType: 'user', actorId: owner!.id, actorName: ownerName, createdAt })

    if (trx.length) await tx.insert(t.orderTransaction).values(trx)
    await tx.insert(t.orderEvent).values(events)
  }

  // A gift card issued from the gift card order, plus an abandoned cart for the expiry cron
  await tx.insert(t.giftCard).values({ code: 'KOLA-GIFT-7Q2M-XR9D', value: 25000, balance: 18000, currencyCode: 'GHS', regionId: gh.id })
  const [abandoned] = await tx
    .insert(t.cart)
    .values({ regionId: gh.id, salesChannelId: web.id, currencyCode: 'GHS', email: 'guest@example.com', expiresAt: daysAgo(1), createdAt: daysAgo(8) })
    .returning()
  const tote = variantsByHandle['kente-weave-tote']![0]!
  await tx.insert(t.cartLineItem).values({ cartId: abandoned!.id, variantId: tote.id, productId: tote.productId, title: tote.productTitle, variantTitle: tote.title, sku: tote.sku, productHandle: tote.productHandle, quantity: 1, unitPrice: tote.prices.GHS, isTaxInclusive: true })

  return { pkToken, ownerEmail: owner!.email }
}

// ── helpers ─────────────────────────────────────────────────────────────


function eqVariant(variantId: string) {
  return eq(t.priceSet.variantId, variantId)
}

function sqlReserve(inventoryItemId: string, locationId: string, qty: number) {
  return sql`update inventory_level set reserved = reserved + ${qty} where inventory_item_id = ${inventoryItemId} and location_id = ${locationId}`
}

async function insertShippingOption(
  tx: Tx,
  values: typeof t.shippingOption.$inferInsert,
  prices: [string, number][],
) {
  const [row] = await tx.insert(t.shippingOption).values(values).returning()
  await tx.insert(t.shippingOptionPrice).values(prices.map(([currencyCode, amount]) => ({ shippingOptionId: row!.id, currencyCode, amount })))
  return { id: row!.id, name: row!.name, prices: Object.fromEntries(prices) as Partial<Record<Cur, number>> }
}

const db = createDb(url)
try {
  const result = await db.transaction(seed)
  console.log('Seeded Kola Market')
  console.log(`  Admin:            ${result.ownerEmail}`)
  console.log(`  Publishable key:  ${result.pkToken}`)
  if (!process.env.NUXT_PUBLIC_PUBLISHABLE_KEY) console.log('  → set NUXT_PUBLIC_PUBLISHABLE_KEY to this value in .env')
  console.log('  Demo customers sign in with password: kola-demo-1234')
} finally {
  await closeDb()
}
