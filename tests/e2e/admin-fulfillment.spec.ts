import 'dotenv/config'
import { expect, test, type APIRequestContext } from '@playwright/test'
import pg from 'pg'

async function publishableKey(): Promise<string> {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL })
  await client.connect()
  const { rows } = await client.query<{ token: string }>("select token from api_key where type = 'publishable' and revoked_at is null and deleted_at is null order by created_at limit 1")
  await client.end()
  return rows[0]!.token
}

/** Place a cash-on-delivery order through the store API (the UI flow is covered by checkout.spec). */
async function placeOrder(request: APIRequestContext, pk: string) {
  const h = { 'x-publishable-api-key': pk }
  const created = await request.post('/api/store/carts', { headers: h, data: {} })
  if (!created.ok()) throw new Error(`cart: ${created.status()} ${await created.text()}`)
  const cart = (await created.json()).cart
  const product = (await (await request.get('/api/store/products/shea-body-butter-250ml', { headers: h })).json()).product
  const added = await request.post(`/api/store/carts/${cart.id}/line-items`, { headers: h, data: { variantId: product.variants[0].id, quantity: 1 } })
  if (!added.ok()) throw new Error(`add: ${added.status()} ${await added.text()}`)
  await request.post(`/api/store/carts/${cart.id}`, { headers: h, data: { email: `e2e-ship-${Date.now()}@kola.test`, shippingAddress: { firstName: 'Esi', lastName: 'Ship', address1: '1 Ring Road', city: 'Accra', countryCode: 'GH', phone: '+233200000009' } } })
  const options = (await (await request.get(`/api/store/carts/${cart.id}/shipping-options`, { headers: h })).json()).data
  await request.post(`/api/store/carts/${cart.id}/shipping-methods`, { headers: h, data: { optionId: options.find((o: { name: string }) => o.name === 'Standard delivery').id } })
  await request.post(`/api/store/carts/${cart.id}/payment-sessions`, { headers: h, data: { providerId: 'manual' } })
  const res = await request.post(`/api/store/carts/${cart.id}/complete`, { headers: h })
  expect(res.ok()).toBe(true)
  return (await res.json()).order as { id: string; displayId: number }
}

test('admin fulfills and ships a guest order', async ({ page, request }) => {
  const pk = await publishableKey()
  const order = await placeOrder(request, pk)

  await page.goto('/admin/login')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(process.env.ADMIN_SEED_EMAIL!)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(process.env.ADMIN_SEED_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin\/orders/)
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search orders' }).fill(String(order.displayId))
  await page.getByRole('link', { name: `#${order.displayId}` }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${order.id}`))
  await expect(page.getByRole('heading', { level: 1, name: `#${order.displayId}` })).toBeVisible()

  await page.getByRole('button', { name: 'Create fulfillment' }).click()
  const fulfill = page.getByRole('dialog', { name: 'Create fulfillment' })
  await fulfill.getByRole('button', { name: 'Create fulfillment' }).click()
  await expect(page.getByText('Fulfillment created').first()).toBeVisible()

  await page.getByRole('button', { name: 'Mark as shipped' }).first().click()
  const ship = page.getByRole('dialog', { name: 'Mark as shipped' })
  await ship.getByRole('textbox', { name: 'Tracking number', exact: true }).fill('GH-E2E-123')
  await ship.getByRole('button', { name: 'Mark as shipped' }).click()

  await expect(page.locator('.order-meta').getByText('Shipped')).toBeVisible()
  await expect(page.getByText('GH-E2E-123').first()).toBeVisible()
})
