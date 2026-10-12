import { expect, test } from '@playwright/test'
import { appUrl, CAPE_TOWN, ISS_PASS_PEAK, serveFixtureData } from './helpers.ts'

test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ context }) => {
  await serveFixtureData(context)
})

test('asks where you are on a first visit, and accepts typed coordinates', async ({ page }) => {
  await page.goto('./')
  const prompt = page.getByTestId('location-prompt')
  await expect(prompt).toBeVisible()
  await prompt.getByRole('textbox').fill('51.48, -0.01')
  await prompt.getByRole('button', { name: 'Set' }).click()
  await expect(prompt).toBeHidden()
  await expect(page.getByRole('status').first()).toContainText('51.480° N')
})

test('shows the ISS high and bright over Cape Town during its pass', async ({ page }) => {
  await page.goto(appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1, sat: 25544 }))
  const card = page.getByTestId('info-card')
  await expect(card).toContainText('ISS')
  await expect(card).toContainText(/\d+° up in the/)
  await expect(card).toContainText(/brilliant|very bright/)
  await expect(page.getByRole('status').first()).toContainText(/\d+ visible/)
})

test('lists the ISS among the visible passes and jumps to it', async ({ page }) => {
  await page.goto(appUrl({ ...CAPE_TOWN, t: '2026-10-11T16:30:00Z', paused: 1 }))
  await page.getByRole('button', { name: 'Passes', exact: true }).click()
  const list = page.getByTestId('passes-list')
  await expect(list).toContainText('ISS')
  await list.getByRole('button', { name: /ISS/ }).first().click()
  await expect(page.getByTestId('info-card')).toContainText('ISS')
  // The clock jumped to a minute before the pass.
  await expect(page.getByTestId('time')).toContainText(/\d\d:32:\d\d/)
})

test('finds a satellite by its common name', async ({ page }) => {
  await page.goto(appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1 }))
  await page.getByRole('button', { name: 'Find a satellite' }).click()
  await page.getByRole('searchbox').fill('hubble')
  await page.getByRole('button', { name: /Hubble/ }).click()
  await expect(page.getByTestId('info-card')).toContainText('Hubble')
})

test('steps time and returns to live', async ({ page }) => {
  await page.goto(appUrl({ ...CAPE_TOWN }))
  const time = page.getByTestId('time')
  await expect(time).toContainText('Live')
  await page.getByRole('button', { name: 'Forward one hour' }).click()
  // Late in the evening an hour on is tomorrow.
  await expect(time).toContainText(/\+1 h|Tomorrow/)
  await time.click()
  await expect(time).toContainText('Live')
})

test('night mode turns the interface red', async ({ page }) => {
  await page.goto(appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1 }))
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel(/Night mode/).check()
  await expect(page.locator('html')).toHaveClass(/night/)
})

test('switches between map, sky and AR views', async ({ page }) => {
  await page.goto(appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1 }))
  await page.getByRole('button', { name: 'Sky', exact: true }).click()
  await expect(page.locator('.app')).toHaveClass(/app--sky/)
  await page.getByRole('button', { name: 'AR', exact: true }).click()
  await expect(page.locator('.app')).toHaveClass(/app--ar/)
  // Headless Chrome has no motion sensors: the AR view must say so rather
  // than sit there blank.
  await expect(page.locator('.ar-overlay')).toContainText(/sensors|camera/i, { timeout: 8000 })
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.app')).toHaveClass(/app--map/)
})

test('remembers settings across visits', async ({ page }) => {
  await page.goto(appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1 }))
  await page.getByRole('button', { name: 'Sky', exact: true }).click()
  await page.waitForTimeout(500) // settings save is debounced
  await page.goto(appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1 }))
  await expect(page.locator('.app')).toHaveClass(/app--sky/)
})
