import { test, expect } from '@playwright/test'
import { setupMockApi } from './fixtures/testBase'

test.describe('Authentication Flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page)
  })

  test('renders the sign in screen with pitch highlights', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByText('Somewhere to hang out with your people.')).toBeVisible()
    await expect(page.getByText('Rooms for every conversation')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('switches between Sign In and Create Account modes', async ({ page }) => {
    await page.goto('/')

    // Click link to create account
    await page.getByRole('button', { name: 'Create an account' }).click()

    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await expect(page.getByLabel('Handle', { exact: true })).toBeVisible()
    await expect(page.getByLabel('E-mail')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()

    // Switch back to Sign In
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  test('shows error message on failed sign in credentials', async ({ page }) => {
    await page.goto('/')

    await page.getByLabel('Handle or e-mail').fill('wrong')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(page.getByText('Invalid handle or password')).toBeVisible()
  })

  test('handles successful sign in and transitions into authenticated app', async ({ page }) => {
    await page.goto('/')

    await page.getByLabel('Handle or e-mail').fill('testuser')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // Upon login, AppShell mounts navigation and community rail
    await expect(page.getByLabel('Communities')).toBeVisible({ timeout: 10000 })
  })

  test('handles registration mode validation and submission', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.getByLabel('Handle', { exact: true }).fill('taken')
    await page.getByLabel('E-mail').fill('taken@genzh.app')
    await page.getByLabel('Password').fill('password12345')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Handle is already taken')).toBeVisible()
  })

  test('displays third party OAuth options (Google, Discord)', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in with Discord' })).toBeVisible()
  })
})
