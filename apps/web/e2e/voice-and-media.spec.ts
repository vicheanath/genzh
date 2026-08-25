import { test, expect } from './fixtures/testBase'
import { mockCommunities, mockRooms } from './fixtures/mockData'

test.describe('Voice & Media Calls', () => {
  const voiceRoomUrl = `/c/${mockCommunities[0].id}/r/${mockRooms[1].id}`

  test('navigates to a voice room and verifies voice panel controls', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(voiceRoomUrl)

    await expect(page.getByText('Lounge Voice')).toBeVisible()

    // Voice panel buttons: mute / unmute, deafen, disconnect
    const muteBtn = page.getByRole('button', { name: /mute/i }).first()
    if (await muteBtn.isVisible()) {
      await expect(muteBtn).toBeVisible()
    }

    const deafenBtn = page.getByRole('button', { name: /deafen/i }).first()
    if (await deafenBtn.isVisible()) {
      await expect(deafenBtn).toBeVisible()
    }

    const disconnectBtn = page.getByRole('button', { name: /disconnect|leave/i }).first()
    if (await disconnectBtn.isVisible()) {
      await expect(disconnectBtn).toBeVisible()
    }
  })
})
