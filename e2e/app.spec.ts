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
  await prompt.getByTestId('location-input').fill('51.48, -0.01')
  await prompt.getByRole('button', { name: 'Set' }).click()
  await expect(prompt).toBeHidden()
  await expect(page.getByRole('status').first()).toContainText('51.480° N')
})

test('finds a town by name for the location', async ({ page }) => {
  await page.goto('./')
  const prompt = page.getByTestId('location-prompt')
  await prompt.getByTestId('location-input').fill('cape t')
  await prompt.getByRole('button', { name: /Cape Town/ }).first().click()
  await expect(prompt).toBeHidden()
  await expect(page.getByRole('status').first()).toContainText('Cape Town')
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

test('in daylight, points to the next bright pass', async ({ page }) => {
  // Three hours before the evening ISS pass, the Sun is still up.
  const before = new Date(Date.parse(ISS_PASS_PEAK) - 3 * 3_600_000).toISOString()
  await page.goto(appUrl({ ...CAPE_TOWN, t: before, paused: 1 }))
  const next = page.getByTestId('next-pass')
  await expect(next).toContainText('ISS')
  await next.click()
  await expect(page.getByTestId('info-card')).toContainText('ISS')
  await expect(page.getByTestId('time')).not.toContainText('Live')
})

test('a docked module points to its station', async ({ page }) => {
  await page.goto(appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1 }))
  await page.getByRole('button', { name: 'Find a satellite' }).click()
  await page.getByRole('searchbox').fill('poisk')
  await page.getByRole('button', { name: /POISK/ }).click()
  const card = page.getByTestId('info-card')
  await expect(card).toContainText('Docked to ISS')
  await card.getByRole('button', { name: 'ISS' }).click()
  await expect(card.getByRole('heading')).toHaveText('ISS')
})

test('shares a link to the next pass, with the place rounded', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { shared?: ShareData }
    navigator.share = (data?: ShareData) => {
      w.shared = data
      return Promise.resolve()
    }
  })
  const before = new Date(Date.parse(ISS_PASS_PEAK) - 3 * 3_600_000).toISOString()
  await page.goto(appUrl({ lat: -33.9249, lon: 18.4241, t: before, paused: 1, sat: 25544 }))
  const card = page.getByTestId('info-card')
  await expect(card).toContainText('Next visible')
  await card.getByRole('button', { name: 'Share ISS' }).click()
  const shared = await page.evaluate(() => (window as unknown as { shared?: ShareData }).shared)
  expect(shared?.text).toMatch(/^ISS passes over/)
  const url = new URL(shared!.url!)
  expect(url.searchParams.get('lat')).toBe('-33.92')
  expect(url.searchParams.get('lon')).toBe('18.42')
  expect(url.searchParams.get('sat')).toBe('25544')
  // A minute before the visible pass starts.
  expect(Date.parse(url.searchParams.get('t')!)).toBeGreaterThan(Date.parse(before))
})

test('works out what you saw a few minutes ago', async ({ page }) => {
  const later = new Date(Date.parse(ISS_PASS_PEAK) + 5 * 60_000).toISOString()
  await page.goto(appUrl({ ...CAPE_TOWN, t: later, paused: 1 }))
  await page.getByRole('button', { name: 'Find a satellite' }).click()
  await page.getByRole('button', { name: 'Work out what it was' }).click()
  const panel = page.getByTestId('recall-panel')
  await panel.getByRole('group', { name: 'It came from' }).getByRole('button', { name: 'W', exact: true }).click()
  await panel.getByRole('button', { name: /Bright/ }).click()
  await panel.getByRole('button', { name: 'Find it' }).click()
  await expect(panel.getByTestId('recall-results').getByRole('listitem').first()).toContainText('ISS')
})
