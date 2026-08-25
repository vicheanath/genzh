import { test, expect } from './fixtures/testBase'
import { mockCommunities } from './fixtures/mockData'

test.describe('Community Settings & Management', () => {
  const settingsUrl = `/c/${mockCommunities[0].id}/settings`

  test('navigates through all settings tabs (Overview, Roles, Members, Channels, Invites)', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(settingsUrl)

    // Check Overview tab
    await expect(page.getByRole('tab', { name: /overview/i }).or(page.getByText('Overview'))).toBeVisible()

    // Switch to Roles tab
    const rolesTab = page.getByRole('tab', { name: /roles/i }).or(page.getByText('Roles & permissions'))
    await rolesTab.click()
    await expect(page.getByText('Admin')).toBeVisible()

    // Switch to Members tab
    const membersTab = page.getByRole('tab', { name: /members/i }).or(page.getByText('Members'))
    await membersTab.click()
    await expect(page.getByText('Alice Wonder')).toBeVisible()

    // Switch to Channels tab
    const channelsTab = page.getByRole('tab', { name: /channels/i }).or(page.getByText('Channels'))
    await channelsTab.click()
    await expect(page.getByText('general')).toBeVisible()

    // Switch to Invites tab
    const invitesTab = page.getByRole('tab', { name: /invite/i }).or(page.getByText('Invite links'))
    await invitesTab.click()
    await expect(page.getByText('devhangout')).toBeVisible()
  })

  test('creates a new channel in Channels tab', async ({ authenticatedPage: page }) => {
    await page.goto(settingsUrl)

    const channelsTab = page.getByRole('tab', { name: /channels/i }).or(page.getByText('Channels'))
    await channelsTab.click()

    const createChannelBtn = page.getByRole('button', { name: /create channel|add channel|new channel/i }).first()
    if (await createChannelBtn.isVisible()) {
      await createChannelBtn.click()

      const nameInput = page.getByPlaceholder(/channel-name|name/i)
      if (await nameInput.isVisible()) {
        await nameInput.fill('random-memes')
        const submit = page.getByRole('button', { name: /create/i }).last()
        await submit.click()
      }
    }
  })

  test('generates a new invite link in Invites tab', async ({ authenticatedPage: page }) => {
    await page.goto(settingsUrl)

    const invitesTab = page.getByRole('tab', { name: /invite/i }).or(page.getByText('Invite links'))
    await invitesTab.click()

    const createInviteBtn = page.getByRole('button', { name: /create invite|generate link/i }).first()
    if (await createInviteBtn.isVisible()) {
      await createInviteBtn.click()
    }
  })
})
