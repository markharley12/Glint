/** The installed app must open and show the sky with no network. */
import { expect, test } from '@playwright/test'
import { appUrl, CAPE_TOWN, ISS_PASS_PEAK, serveFixtureData } from './helpers.ts'

test.use({ serviceWorkers: 'allow' })

test('reopens offline from the service worker cache', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser is enough for this')
  await serveFixtureData(context)
  const url = appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1, sat: 25544 })
  await page.goto(url)
  await expect(page.getByTestId('info-card')).toContainText('ISS')
  // Wait for the worker to install and take control.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
    }
  })
  // One controlled load so the data requests go through (and into) its cache.
  await page.reload()
  await expect(page.getByTestId('info-card')).toContainText('ISS')

  await context.unroute('**/data/*.json')
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('info-card')).toContainText('ISS')
  await expect(page.getByRole('status').first()).toContainText(/\d+ visible/)
})
