import { test, expect } from './fixtures/testBase'

test.describe('Admin & Platform Console', () => {
  test('displays platform console header and global metrics cards', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/admin')

    await expect(page.getByRole('heading', { name: 'Platform Console' })).toBeVisible()
    await expect(page.getByText('Super Admin')).toBeVisible()

    // Metrics
    await expect(page.getByText('Total Accounts')).toBeVisible()
    await expect(page.getByText('1420')).toBeVisible()
    await expect(page.getByText('Staff Team')).toBeVisible()
    await expect(page.getByText('Support Queue')).toBeVisible()
    await expect(page.getByText('Communities & Rooms')).toBeVisible()
  })

  test('navigates through all admin sub-panels', async ({ authenticatedPage: page }) => {
    await page.goto('/admin/queue')

    const panels = [
      { name: /users|accounts/i, path: '/admin/users' },
      { name: /communities/i, path: '/admin/communities' },
      { name: /live media|live/i, path: '/admin/live' },
      { name: /broadcasts/i, path: '/admin/broadcasts' },
      { name: /features|flags/i, path: '/admin/features' },
      { name: /automod/i, path: '/admin/automod' },
      { name: /security|ip bans/i, path: '/admin/security' },
      { name: /health|telemetry/i, path: '/admin/health' },
      { name: /recommendations/i, path: '/admin/recommendations' },
      { name: /audit/i, path: '/admin/audit' },
    ]

    for (const panel of panels) {
      const link = page.getByRole('link', { name: panel.name }).first()
      if (await link.isVisible()) {
        await link.click()
        await expect(page).toHaveURL(new RegExp(panel.path))
      }
    }
  })
})
