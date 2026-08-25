import { test, expect } from './fixtures/testBase'

test.describe('Explore & Community Discovery', () => {
  test('displays available communities in Explore tab', async ({ authenticatedPage: page }) => {
    await page.goto('/explore')

    await expect(page.getByRole('heading', { name: /explore/i })).toBeVisible()
    await expect(page.getByText('Developers Hangout')).toBeVisible()
    await expect(page.getByText('Gaming Universe')).toBeVisible()
  })

  test('filters communities via search bar', async ({ authenticatedPage: page }) => {
    await page.goto('/explore')

    const searchInput = page.getByPlaceholder(/search communities/i)
    await searchInput.fill('Gaming')

    await expect(page.getByText('Gaming Universe')).toBeVisible()
    await expect(page.getByText('Developers Hangout')).not.toBeVisible()
  })

  test('joins a community from explore card', async ({ authenticatedPage: page }) => {
    await page.goto('/explore')

    const gamingCard = page.locator('article, div').filter({ hasText: 'Gaming Universe' })
    const joinBtn = gamingCard.getByRole('button', { name: /join/i }).first()

    if (await joinBtn.isVisible()) {
      await joinBtn.click()
      await expect(page.getByText(/joined community/i)).toBeVisible()
    }
  })

  test('opens and submits Add Community modal', async ({ authenticatedPage: page }) => {
    await page.goto('/explore')

    // Find the Add / Create community button
    const createBtn = page.getByRole('button', { name: /create community|add community|create a community/i }).first()
    await createBtn.click()

    await expect(page.getByRole('heading', { name: /create a community|new community/i })).toBeVisible()

    // Fill form
    const nameInput = page.getByLabel(/community name|name/i).or(page.getByPlaceholder(/e.g. cozy lounge/i))
    if (await nameInput.isVisible()) {
      await nameInput.fill('TypeScript Masters')
    }

    const submitBtn = page.getByRole('button', { name: /create/i }).last()
    await submitBtn.click()
  })
})
