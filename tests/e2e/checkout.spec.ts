import { expect, test } from '@playwright/test'

test('guest checkout in GHS with cash on delivery @mobile', async ({ page }) => {
  const email = `e2e-${Date.now()}@kola.test`
  await page.goto('/products/shea-body-butter-250ml')
  await expect(page.getByRole('heading', { level: 1, name: 'Shea Body Butter 250ml' })).toBeVisible()
  await expect(page.locator('.info').getByText('GH₵120.00')).toBeVisible()

  await page.getByRole('radio', { name: 'Lemongrass' }).click()
  await page.getByRole('button', { name: 'Add to cart' }).click()

  const drawer = page.getByRole('dialog', { name: /Cart/ })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Lemongrass')).toBeVisible()
  await drawer.getByRole('link', { name: 'Checkout' }).click()

  await expect(page).toHaveURL(/\/checkout/)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByRole('textbox', { name: 'First name', exact: true }).fill('Ama')
  await page.getByRole('textbox', { name: 'Last name', exact: true }).fill('Tester')
  await page.getByRole('textbox', { name: 'Address', exact: true }).fill('12 Liberation Road')
  await page.getByRole('textbox', { name: 'City', exact: true }).fill('Accra')
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+233244000111')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByText('Standard delivery')).toBeVisible()
  await page.getByText('Standard delivery').click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByText('Cash on delivery').click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByRole('button', { name: /Place order/ }).click()

  await expect(page).toHaveURL(/\/order\/confirmed\//)
  await expect(page.getByText('Your order is confirmed.')).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByText(/#\d{5}/).first()).toBeVisible()
  await expect(page.getByText('Shea Body Butter 250ml')).toBeVisible()
})
