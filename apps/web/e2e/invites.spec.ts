import { test, expect } from './fixtures/testBase'
import { setupMockApi, loginAsTestUser } from './fixtures/testBase'

test.describe('Invite Links & Onboarding Flow', () => {
  test('displays invite landing preview and accepts invite when authenticated', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/invite/devhangout')

    await expect(page.getByText('Developers Hangout')).toBeVisible()
    await expect(page.getByText('A cozy place for coders and creators')).toBeVisible()
    await expect(page.getByText('42 members')).toBeVisible()

    const acceptBtn = page.getByRole('button', { name: /accept invite|join/i })
    await expect(acceptBtn).toBeVisible()
    await acceptBtn.click()

    // Navigates into the community
    await expect(page).toHaveURL(/\/c\//)
  })

  test('displays fallback screen on invalid invite code', async ({ page }) => {
    await setupMockApi(page)
    await page.goto('/invite/invalid-code')

    await expect(page.getByText(/invalid or expired invite/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /back to home/i })).toBeVisible()
  })
})
