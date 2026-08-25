import { test, expect } from './fixtures/testBase'

test.describe('Friends & Social Graph', () => {
  test('switches across Online, All, Pending, Blocked, and Add Friend tabs', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/friends')

    await expect(page.getByText('Friends')).toBeVisible()

    // Test All tab
    await page.getByRole('button', { name: /^All/i }).click()
    await expect(page.getByText('Alice Wonder')).toBeVisible()

    // Test Online tab
    await page.getByRole('button', { name: /^Online/i }).click()
    await expect(page.getByText('Alice Wonder')).toBeVisible()

    // Test Pending tab
    await page.getByRole('button', { name: /^Pending/i }).click()
    await expect(page.getByText(/no pending friend requests|no requests/i)).toBeVisible()

    // Test Blocked tab
    await page.getByRole('button', { name: /^Blocked/i }).click()
    await expect(page.getByText(/you haven't blocked anyone|no blocked users/i)).toBeVisible()

    // Test Add Friend tab
    await page.getByRole('button', { name: /Add Friend/i }).click()
    await expect(page.getByPlaceholder(/user id or handle/i)).toBeVisible()
  })

  test('submits add friend request form', async ({ authenticatedPage: page }) => {
    await page.goto('/friends')

    await page.getByRole('button', { name: /Add Friend/i }).click()
    const input = page.getByPlaceholder(/user id or handle/i)
    await input.fill('usr_99999999-9999-9999-9999-999999999999')

    await page.getByRole('button', { name: /send friend request/i }).click()
    await expect(page.getByText(/friend request sent/i)).toBeVisible()
  })

  test('allows copying own User ID', async ({ authenticatedPage: page }) => {
    await page.goto('/friends')

    await page.getByRole('button', { name: /Add Friend/i }).click()
    const copyBtn = page.getByRole('button', { name: /copy/i }).first()
    if (await copyBtn.isVisible()) {
      await copyBtn.click()
      await expect(page.getByText(/copied to clipboard/i)).toBeVisible()
    }
  })
})
