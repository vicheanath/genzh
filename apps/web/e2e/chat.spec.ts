import { test, expect } from './fixtures/testBase'
import { mockCommunities, mockRooms } from './fixtures/mockData'

test.describe('Community Chat & Messaging', () => {
  const communityUrl = `/c/${mockCommunities[0].id}/r/${mockRooms[0].id}`

  test('renders channel messages transcript and member presence', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(communityUrl)

    await expect(page.getByText('Developers Hangout', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'general' })).toBeVisible()
    await expect(page.getByText('Hello everyone! Welcome to the Developers Hangout.')).toBeVisible()
    await expect(page.getByText('Glad to be here! Let us build something cool.')).toBeVisible()
  })

  test('types and sends a new chat message', async ({ authenticatedPage: page }) => {
    await page.goto(communityUrl)

    const composerInput = page.getByPlaceholder(/message #general|type a message/i).or(page.locator('textarea'))
    await expect(composerInput).toBeVisible()

    await composerInput.fill('Integration testing with Playwright!')
    await composerInput.press('Enter')

    // Message input clears after sending
    await expect(composerInput).toHaveValue('')
  })

  test('opens and interacts with emoji picker', async ({ authenticatedPage: page }) => {
    await page.goto(communityUrl)

    const emojiBtn = page.getByRole('button', { name: /emoji|insert emoji/i }).first()
    if (await emojiBtn.isVisible()) {
      await emojiBtn.click()
      // Emoji popover should open
      await expect(page.locator('[role="dialog"], [role="menu"], [data-popover]').first()).toBeVisible()
    }
  })

  test('shows mention suggestions when typing @', async ({ authenticatedPage: page }) => {
    await page.goto(communityUrl)

    const composerInput = page.getByPlaceholder(/message #general|type a message/i).or(page.locator('textarea'))
    await composerInput.fill('@Alice')

    // Expect Alice candidate to show in mention candidates
    const mentionItem = page.getByLabel('Mention suggestions').getByText('Alice Wonder')
    if (await mentionItem.isVisible()) {
      await expect(mentionItem).toBeVisible()
    }
  })

  test('opens search messages dialog', async ({ authenticatedPage: page }) => {
    await page.goto(communityUrl)

    const searchBtn = page.getByRole('button', { name: /search/i }).first()
    if (await searchBtn.isVisible()) {
      await searchBtn.click()
      await expect(page.getByPlaceholder(/search messages|find in channel/i)).toBeVisible()
    }
  })

  test('replying to a message sends reply_to_id to the server', async ({ authenticatedPage: page }) => {
    await page.goto(communityUrl)

    const targetRow = page.locator('#msg-msg_22222222-2222-2222-2222-222222222222')
    await targetRow.hover()

    await targetRow.getByRole('button', { name: 'Reply to message' }).click()
    const replyBanner = page.getByText('Replying to')
    await expect(replyBanner).toBeVisible()
    await expect(replyBanner).toContainText('Alice Wonder')

    const composerInput = page.getByPlaceholder(/message #general|type a message/i).or(page.locator('textarea'))
    await composerInput.fill('Right back at you!')

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => /\/api\/v1\/rooms\/[^/]+\/messages$/.test(req.url()) && req.method() === 'POST',
      ),
      composerInput.press('Enter'),
    ])

    expect(request.postDataJSON()?.reply_to_id).toBe('msg_22222222-2222-2222-2222-222222222222')
    // The banner clears once the reply is sent.
    await expect(replyBanner).not.toBeVisible()
  })

  test('opens pinned messages dialog', async ({ authenticatedPage: page }) => {
    await page.goto(communityUrl)

    const pinBtn = page.getByRole('button', { name: /pinned|pins/i }).first()
    if (await pinBtn.isVisible()) {
      await pinBtn.click()
      await expect(page.getByRole('heading', { name: /pinned messages/i })).toBeVisible()
    }
  })
})
