import 'dotenv/config'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** WCAG 2.1 A/AA scan of the main storefront and admin screens. */
async function scan(page: Page, path: string, heading?: RegExp | string) {
  await page.goto(path)
  if (heading) await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  await page.waitForLoadState('networkidle')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const problems = results.violations.map((v) => `${v.impact} · ${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(problems, `${path}\n${problems.join('\n')}`).toEqual([])
}

test.describe('storefront accessibility', () => {
  for (const [path, heading] of [
    ['/', /Made slowly/],
    ['/shop', 'Shop'],
    ['/collections', 'Collections'],
    ['/products/adinkra-linen-shirt', 'Adinkra Linen Shirt'],
    ['/cart', 'Cart'],
    ['/checkout', 'Checkout'],
    ['/account/login', 'Sign in'],
    ['/order/lookup', 'Find an order'],
  ] as const) {
    test(`${path} @mobile`, async ({ page }) => scan(page, path, heading))
  }
})

const ADMIN_STATE = 'test-results/.admin-state.json'

test.describe('admin accessibility', () => {
  // The global setup signs in once and saves the session (logging in per test would trip the rate limit).
  test.use({ storageState: ADMIN_STATE })
  for (const [path, heading] of [
    ['/admin/orders', 'Orders'],
    ['/admin/products', 'Products'],
    ['/admin/products/new', 'New product'],
    ['/admin/inventory', 'Inventory'],
    ['/admin/customers', 'Customers'],
    ['/admin/promotions', 'Promotions'],
    ['/admin/settings/regions', 'Regions'],
    ['/admin/settings/locations', 'Locations & shipping'],
    ['/admin/analytics', 'Analytics'],
  ] as const) {
    test(path, async ({ page }) => scan(page, path, heading))
  }
  test('order detail', async ({ page }) => {
    await page.goto('/admin/orders')
    await page.getByRole('link', { name: /^#\d+$/ }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: /^#\d+$/ })).toBeVisible()
    await scan(page, page.url().replace(/^https?:\/\/[^/]+/, ''))
  })
})
