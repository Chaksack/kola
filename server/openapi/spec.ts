/**
 * OpenAPI 3.1 document built from the same zod schemas the routes validate with, so the docs can't
 * drift from the code's input rules. Response bodies are described in prose (they're typed in code).
 */
import { z, type ZodType } from 'zod'
import { emailSchema, listQuerySchema } from '../../shared/schemas/common'
import { apiKeyCreateSchema, customerAddressSchema, customerRegisterSchema, inviteAcceptSchema, inviteCreateSchema, loginSchema } from '../../shared/schemas/auth'
import { categoryInputSchema, collectionInputSchema, productInputSchema, productListQuerySchema } from '../../shared/schemas/catalog'
import { inventoryItemUpdateSchema, locationInputSchema, shippingOptionInputSchema } from '../../shared/schemas/fulfillment'
import { regionInputSchema, salesChannelInputSchema } from '../../shared/schemas/region'
import { cartCreateSchema, cartUpdateSchema, lineItemCreateSchema, lineItemUpdateSchema, promoCodeSchema, storeProductListQuerySchema } from '../../shared/schemas/store'
import { adminOrderListQuerySchema, captureSchema, editSchema, exchangeCreateSchema, fulfillmentCreateSchema, noteSchema, refundSchema, returnCreateSchema, returnReceiveSchema, shipSchema } from '../../shared/schemas/order'
import { campaignInputSchema, customerInputSchema, giftCardInputSchema, priceListInputSchema, priceListPricesSchema, promotionInputSchema } from '../../shared/schemas/marketing'

type Auth = 'store' | 'admin' | 'public' | 'cron' | 'signature'
interface Op {
  method: 'get' | 'post' | 'patch' | 'delete'
  path: string
  summary: string
  tag: string
  auth: Auth
  body?: ZodType
  query?: ZodType
  idempotent?: boolean
}

const id = (name = 'id') => `{${name}}`
const ops: Op[] = [
  // Store
  { method: 'get', path: '/api/store/regions', summary: 'List regions with countries, currency and available payment providers', tag: 'Store · Regions', auth: 'store' },
  { method: 'get', path: '/api/store/products', summary: 'List published products in the key’s sales channels, priced for a region, with facets', tag: 'Store · Products', auth: 'store', query: storeProductListQuerySchema },
  { method: 'get', path: `/api/store/products/${id('handle')}`, summary: 'Product detail by handle with variant prices, stock state and related products', tag: 'Store · Products', auth: 'store', query: z.object({ regionId: z.string().optional() }) },
  { method: 'get', path: '/api/store/collections', summary: 'List collections', tag: 'Store · Products', auth: 'store' },
  { method: 'get', path: `/api/store/collections/${id('handle')}`, summary: 'Collection by handle', tag: 'Store · Products', auth: 'store' },
  { method: 'get', path: '/api/store/categories', summary: 'Active public categories (flat, with parentId)', tag: 'Store · Products', auth: 'store' },
  { method: 'post', path: '/api/store/carts', summary: 'Create a cart', tag: 'Store · Carts', auth: 'store', body: cartCreateSchema },
  { method: 'get', path: `/api/store/carts/${id()}`, summary: 'Get a cart with computed totals', tag: 'Store · Carts', auth: 'store' },
  { method: 'post', path: `/api/store/carts/${id()}`, summary: 'Update email, addresses or region (re-prices lines)', tag: 'Store · Carts', auth: 'store', body: cartUpdateSchema },
  { method: 'post', path: `/api/store/carts/${id()}/line-items`, summary: 'Add a variant (merges with an existing line)', tag: 'Store · Carts', auth: 'store', body: lineItemCreateSchema },
  { method: 'post', path: `/api/store/carts/${id()}/line-items/${id('lineId')}`, summary: 'Change a line’s quantity (0 removes it)', tag: 'Store · Carts', auth: 'store', body: lineItemUpdateSchema },
  { method: 'delete', path: `/api/store/carts/${id()}/line-items/${id('lineId')}`, summary: 'Remove a line', tag: 'Store · Carts', auth: 'store' },
  { method: 'post', path: `/api/store/carts/${id()}/promotions`, summary: 'Apply a promotion code', tag: 'Store · Carts', auth: 'store', body: promoCodeSchema },
  { method: 'delete', path: `/api/store/carts/${id()}/promotions/${id('code')}`, summary: 'Remove a promotion code', tag: 'Store · Carts', auth: 'store' },
  { method: 'get', path: `/api/store/carts/${id()}/shipping-options`, summary: 'Shipping options for the cart’s address', tag: 'Store · Checkout', auth: 'store' },
  { method: 'post', path: `/api/store/carts/${id()}/shipping-methods`, summary: 'Choose a shipping option', tag: 'Store · Checkout', auth: 'store', body: z.object({ optionId: z.string() }) },
  { method: 'post', path: `/api/store/carts/${id()}/payment-sessions`, summary: 'Start payment with a provider (paystack, paystack-momo, stripe, manual)', tag: 'Store · Checkout', auth: 'store', body: z.object({ providerId: z.string() }) },
  { method: 'post', path: `/api/store/carts/${id()}/complete`, summary: 'Complete checkout and create the order. Send Idempotency-Key.', tag: 'Store · Checkout', auth: 'store', idempotent: true },
  { method: 'post', path: '/api/store/customers', summary: 'Register a customer account', tag: 'Store · Customers', auth: 'store', body: customerRegisterSchema },
  { method: 'post', path: '/api/store/auth/login', summary: 'Customer sign in', tag: 'Store · Customers', auth: 'store', body: loginSchema },
  { method: 'post', path: '/api/store/auth/logout', summary: 'Customer sign out', tag: 'Store · Customers', auth: 'store' },
  { method: 'get', path: '/api/store/customers/me', summary: 'Signed-in customer with addresses', tag: 'Store · Customers', auth: 'store' },
  { method: 'post', path: '/api/store/customers/me/addresses', summary: 'Add an address', tag: 'Store · Customers', auth: 'store', body: customerAddressSchema },
  { method: 'get', path: '/api/store/customers/me/orders', summary: 'Order history', tag: 'Store · Customers', auth: 'store', query: listQuerySchema },
  { method: 'get', path: `/api/store/orders/${id()}`, summary: 'Order lookup by id + email (or as the signed-in owner)', tag: 'Store · Orders', auth: 'store', query: z.object({ email: emailSchema.optional() }) },
  { method: 'post', path: '/api/store/orders/lookup', summary: 'Order lookup by display number + email', tag: 'Store · Orders', auth: 'store', body: z.object({ displayId: z.number().int(), email: emailSchema }) },
  // Admin
  { method: 'post', path: '/api/admin/auth/login', summary: 'Admin sign in (sets a session cookie)', tag: 'Admin · Auth', auth: 'public', body: loginSchema },
  { method: 'post', path: '/api/admin/invites', summary: 'Invite a team member (admin+)', tag: 'Admin · Team', auth: 'admin', body: inviteCreateSchema },
  { method: 'post', path: '/api/admin/invites/accept', summary: 'Accept an invite', tag: 'Admin · Team', auth: 'public', body: inviteAcceptSchema },
  { method: 'get', path: '/api/admin/users', summary: 'List users', tag: 'Admin · Team', auth: 'admin', query: listQuerySchema },
  { method: 'post', path: '/api/admin/api-keys', summary: 'Create a publishable or secret key (secret shown once)', tag: 'Admin · Team', auth: 'admin', body: apiKeyCreateSchema },
  { method: 'get', path: '/api/admin/products', summary: 'List products', tag: 'Admin · Catalog', auth: 'admin', query: productListQuerySchema },
  { method: 'post', path: '/api/admin/products', summary: 'Create a product with options, variants, prices and stock', tag: 'Admin · Catalog', auth: 'admin', body: productInputSchema },
  { method: 'post', path: `/api/admin/products/${id()}`, summary: 'Replace a product (full save)', tag: 'Admin · Catalog', auth: 'admin', body: productInputSchema },
  { method: 'post', path: '/api/admin/collections', summary: 'Create a collection', tag: 'Admin · Catalog', auth: 'admin', body: collectionInputSchema },
  { method: 'post', path: '/api/admin/categories', summary: 'Create a category', tag: 'Admin · Catalog', auth: 'admin', body: categoryInputSchema },
  { method: 'post', path: '/api/admin/uploads', summary: 'Upload images (multipart "files"); JPEG, PNG, WebP, AVIF, GIF up to 5MB', tag: 'Admin · Catalog', auth: 'admin' },
  { method: 'get', path: '/api/admin/exports/products', summary: 'Export products as CSV, one chunk per call', tag: 'Admin · Catalog', auth: 'admin', query: z.object({ offset: z.number().int().optional(), limit: z.number().int().optional() }) },
  { method: 'post', path: '/api/admin/imports/products', summary: 'Import up to 50 products per call (rows grouped by handle)', tag: 'Admin · Catalog', auth: 'admin', body: z.object({ products: z.array(z.array(z.record(z.string(), z.string()))), dryRun: z.boolean().optional() }) },
  { method: 'post', path: `/api/admin/inventory/${id()}`, summary: 'Set or adjust stock levels', tag: 'Admin · Inventory', auth: 'admin', body: inventoryItemUpdateSchema },
  { method: 'post', path: '/api/admin/stock-locations', summary: 'Create a stock location', tag: 'Admin · Inventory', auth: 'admin', body: locationInputSchema },
  { method: 'post', path: '/api/admin/shipping-options', summary: 'Create a shipping option', tag: 'Admin · Inventory', auth: 'admin', body: shippingOptionInputSchema },
  { method: 'post', path: '/api/admin/regions', summary: 'Create a region', tag: 'Admin · Settings', auth: 'admin', body: regionInputSchema },
  { method: 'post', path: '/api/admin/sales-channels', summary: 'Create a sales channel', tag: 'Admin · Settings', auth: 'admin', body: salesChannelInputSchema },
  { method: 'get', path: '/api/admin/orders', summary: 'List orders with tab counts', tag: 'Admin · Orders', auth: 'admin', query: adminOrderListQuerySchema },
  { method: 'get', path: `/api/admin/orders/${id()}`, summary: 'Order detail', tag: 'Admin · Orders', auth: 'admin' },
  { method: 'get', path: '/api/admin/exports/orders', summary: 'Export orders as CSV, one chunk per call', tag: 'Admin · Orders', auth: 'admin', query: z.object({ offset: z.number().int().optional(), limit: z.number().int().optional() }) },
  { method: 'post', path: `/api/admin/orders/${id()}/capture`, summary: 'Capture payment', tag: 'Admin · Orders', auth: 'admin', body: captureSchema },
  { method: 'post', path: `/api/admin/orders/${id()}/refund`, summary: 'Refund (admin+)', tag: 'Admin · Orders', auth: 'admin', body: refundSchema },
  { method: 'post', path: `/api/admin/orders/${id()}/fulfillments`, summary: 'Create a fulfillment', tag: 'Admin · Orders', auth: 'admin', body: fulfillmentCreateSchema },
  { method: 'post', path: `/api/admin/orders/${id()}/fulfillments/${id('fid')}/ship`, summary: 'Mark shipped with tracking', tag: 'Admin · Orders', auth: 'admin', body: shipSchema },
  { method: 'post', path: `/api/admin/orders/${id()}/fulfillments/${id('fid')}/deliver`, summary: 'Mark delivered', tag: 'Admin · Orders', auth: 'admin' },
  { method: 'post', path: `/api/admin/orders/${id()}/cancel`, summary: 'Cancel an unshipped order (admin+)', tag: 'Admin · Orders', auth: 'admin' },
  { method: 'post', path: `/api/admin/orders/${id()}/returns`, summary: 'Request a return', tag: 'Admin · Orders', auth: 'admin', body: returnCreateSchema },
  { method: 'post', path: `/api/admin/orders/${id()}/returns/${id('rid')}/receive`, summary: 'Receive a return, restock and refund', tag: 'Admin · Orders', auth: 'admin', body: returnReceiveSchema },
  { method: 'post', path: `/api/admin/orders/${id()}/exchanges`, summary: 'Create an exchange (admin+)', tag: 'Admin · Orders', auth: 'admin', body: exchangeCreateSchema },
  { method: 'post', path: `/api/admin/orders/${id()}/edits`, summary: 'Propose an order edit (admin+)', tag: 'Admin · Orders', auth: 'admin', body: editSchema },
  { method: 'post', path: `/api/admin/orders/${id()}/edits/${id('cid')}/confirm`, summary: 'Confirm an edit (new order version)', tag: 'Admin · Orders', auth: 'admin' },
  { method: 'post', path: `/api/admin/orders/${id()}/notes`, summary: 'Add a timeline note', tag: 'Admin · Orders', auth: 'admin', body: noteSchema },
  { method: 'get', path: '/api/admin/stats/orders', summary: 'KPI strip: gross sales, orders, AOV, awaiting fulfillment', tag: 'Admin · Orders', auth: 'admin' },
  { method: 'post', path: '/api/admin/customers', summary: 'Create a customer', tag: 'Admin · Customers', auth: 'admin', body: customerInputSchema },
  { method: 'post', path: '/api/admin/promotions', summary: 'Create a promotion', tag: 'Admin · Marketing', auth: 'admin', body: promotionInputSchema },
  { method: 'post', path: '/api/admin/campaigns', summary: 'Create a campaign', tag: 'Admin · Marketing', auth: 'admin', body: campaignInputSchema },
  { method: 'post', path: '/api/admin/price-lists', summary: 'Create a price list', tag: 'Admin · Marketing', auth: 'admin', body: priceListInputSchema },
  { method: 'post', path: `/api/admin/price-lists/${id()}/prices`, summary: 'Set price list prices', tag: 'Admin · Marketing', auth: 'admin', body: priceListPricesSchema },
  { method: 'post', path: '/api/admin/gift-cards', summary: 'Issue a gift card (code shown once)', tag: 'Admin · Marketing', auth: 'admin', body: giftCardInputSchema },
  { method: 'post', path: '/api/admin/webhooks', summary: 'Create an outgoing webhook endpoint (signing secret shown once)', tag: 'Admin · Developer', auth: 'admin', body: z.object({ url: z.string(), events: z.array(z.string()), description: z.string().optional() }) },
  // Platform
  { method: 'post', path: '/api/webhooks/paystack', summary: 'Paystack events (x-paystack-signature HMAC-SHA512)', tag: 'Platform', auth: 'signature' },
  { method: 'post', path: '/api/webhooks/stripe', summary: 'Stripe events (stripe-signature)', tag: 'Platform', auth: 'signature' },
  { method: 'get', path: '/api/cron/cart-expiry', summary: 'Expire abandoned carts (Vercel Cron)', tag: 'Platform', auth: 'cron' },
  { method: 'get', path: '/api/cron/reservation-release', summary: 'Release stale checkout reservations', tag: 'Platform', auth: 'cron' },
  { method: 'get', path: '/api/cron/webhook-retry', summary: 'Deliver due webhook retries', tag: 'Platform', auth: 'cron' },
]

const toSchema = (s: ZodType) => z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>

const errorSchema = { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } }

export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const op of ops) {
    const params = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }))
    if (op.query) {
      const q = toSchema(op.query) as { properties?: Record<string, unknown>; required?: string[] }
      for (const [name, schema] of Object.entries(q.properties ?? {})) params.push({ name, in: 'query', required: Boolean(q.required?.includes(name)), schema: schema as { type: string } })
    }
    if (op.auth === 'store') params.push({ name: 'x-publishable-api-key', in: 'header', required: true, schema: { type: 'string' } })
    if (op.idempotent) params.push({ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } })
    paths[op.path] ??= {}
    paths[op.path]![op.method] = {
      summary: op.summary,
      tags: [op.tag],
      security: op.auth === 'admin' ? [{ session: [] }, { secretKey: [] }] : op.auth === 'cron' ? [{ cron: [] }] : [],
      parameters: params,
      ...(op.body ? { requestBody: { required: true, content: { 'application/json': { schema: toSchema(op.body) } } } } : {}),
      responses: {
        200: { description: 'Success' },
        400: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: errorSchema } } },
        403: { description: 'Role too low', content: { 'application/json': { schema: errorSchema } } },
        404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } },
        409: { description: 'Conflict (stock, state, duplicates)', content: { 'application/json': { schema: errorSchema } } },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Kola Commerce API',
      version: '1.0.0',
      description:
        'Headless commerce API. Store routes need `x-publishable-api-key`. Admin routes accept the admin session cookie or `Authorization: Bearer sk_…`. Money is always integer minor units with a currency code. Lists use `?limit=&offset=&order=&q=` and return `{ data, count, limit, offset }`. Errors return `{ code, message, details }`.',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'kola-session' },
        secretKey: { type: 'http', scheme: 'bearer', description: 'Secret API key (sk_…)' },
        cron: { type: 'http', scheme: 'bearer', description: 'CRON_SECRET' },
      },
    },
    paths,
  }
}
