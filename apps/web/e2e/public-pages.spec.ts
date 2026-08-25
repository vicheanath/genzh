import { test, expect } from '@playwright/test'
import { setupMockApi } from './fixtures/testBase'

test.describe('Public & Info Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page)
  })

  test('loads About page with mission and values', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in|back to app/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible()
  })

  test('loads Community Guidelines page', async ({ page }) => {
    await page.goto('/guidelines')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Community Guidelines' })).toBeVisible()
  })

  test('loads Terms of Service page', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toBeVisible()
  })

  test('loads Privacy Policy page', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible()
  })

  test('loads Contact & Support page', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Contact Us' })).toBeVisible()
  })

  test('loads Abuse Report page', async ({ page }) => {
    await page.goto('/report')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Report Abuse' })).toBeVisible()
  })

  test('redirects unauthenticated protected routes to sign in', async ({ page }) => {
    await page.goto('/friends')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })
})
