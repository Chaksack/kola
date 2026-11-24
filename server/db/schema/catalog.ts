import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { id, timestamps, type Metadata } from './_common'
import { salesChannel } from './sales-channel'

export const PRODUCT_STATUSES = ['draft', 'proposed', 'published', 'rejected'] as const

export const productType = pgTable('product_type', {
  id: id('ptyp'),
  value: text('value').notNull().unique(),
  ...timestamps,
})

export const productTag = pgTable('product_tag', {
  id: id('ptag'),
  value: text('value').notNull().unique(),
  ...timestamps,
})

export const productCollection = pgTable('product_collection', {
  id: id('pcol'),
  title: text('title').notNull(),
  handle: text('handle').notNull().unique(),
  description: text('description'),
  thumbnail: text('thumbnail'),
  metadata: jsonb('metadata').$type<Metadata>(),
  ...timestamps,
})

export const productCategory = pgTable(
  'product_category',
  {
    id: id('pcat'),
    name: text('name').notNull(),
    handle: text('handle').notNull().unique(),
    description: text('description'),
    parentId: text('parent_id').references((): AnyPgColumn => productCategory.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    isInternal: boolean('is_internal').notNull().default(false),
    metadata: jsonb('metadata').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [index('product_category_parent_idx').on(t.parentId)],
)

export const product = pgTable(
  'product',
  {
    id: id('prod'),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    handle: text('handle').notNull(),
    description: text('description'),
    status: text('status', { enum: PRODUCT_STATUSES }).notNull().default('draft'),
    thumbnail: text('thumbnail'),
    isGiftcard: boolean('is_giftcard').notNull().default(false),
    discountable: boolean('discountable').notNull().default(true),
    weight: integer('weight'),
    length: integer('length'),
    height: integer('height'),
    width: integer('width'),
    material: text('material'),
    originCountry: text('origin_country'),
    hsCode: text('hs_code'),
    typeId: text('type_id').references(() => productType.id, { onDelete: 'set null' }),
    collectionId: text('collection_id').references(() => productCollection.id, { onDelete: 'set null' }),
    shippingProfileId: text('shipping_profile_id'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    metadata: jsonb('metadata').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('product_handle_uq').on(t.handle),
    index('product_status_idx').on(t.status),
    index('product_collection_idx').on(t.collectionId),
  ],
)

export const productOption = pgTable(
  'product_option',
  {
    id: id('opt'),
    productId: text('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    rank: integer('rank').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('product_option_product_idx').on(t.productId)],
)

export const productOptionValue = pgTable(
  'product_option_value',
  {
    id: id('optval'),
    optionId: text('option_id')
      .notNull()
      .references(() => productOption.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    rank: integer('rank').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('product_option_value_option_idx').on(t.optionId)],
)

export const productVariant = pgTable(
  'product_variant',
  {
    id: id('variant'),
    productId: text('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sku: text('sku'),
    barcode: text('barcode'),
    manageInventory: boolean('manage_inventory').notNull().default(true),
    allowBackorder: boolean('allow_backorder').notNull().default(false),
    rank: integer('rank').notNull().default(0),
    weight: integer('weight'),
    metadata: jsonb('metadata').$type<Metadata>(),
    ...timestamps,
  },
  (t) => [index('product_variant_product_idx').on(t.productId), uniqueIndex('product_variant_sku_uq').on(t.sku)],
)

export const variantOptionValue = pgTable(
  'variant_option_value',
  {
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariant.id, { onDelete: 'cascade' }),
    optionValueId: text('option_value_id')
      .notNull()
      .references(() => productOptionValue.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.optionValueId] })],
)

export const productImage = pgTable(
  'product_image',
  {
    id: id('img'),
    productId: text('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    alt: text('alt'),
    rank: integer('rank').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('product_image_product_idx').on(t.productId)],
)

export const productCategoryProduct = pgTable(
  'product_category_product',
  {
    categoryId: text('category_id')
      .notNull()
      .references(() => productCategory.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.productId] })],
)

export const productTagLink = pgTable(
  'product_tag_link',
  {
    productId: text('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => productTag.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.tagId] })],
)

export const productSalesChannel = pgTable(
  'product_sales_channel',
  {
    productId: text('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    salesChannelId: text('sales_channel_id')
      .notNull()
      .references(() => salesChannel.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.salesChannelId] })],
)

export const productReview = pgTable(
  'product_review',
  {
    id: id('rev'),
    productId: text('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    customerId: text('customer_id'),
    authorName: text('author_name').notNull(),
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    ...timestamps,
  },
  (t) => [index('product_review_product_idx').on(t.productId)],
)
