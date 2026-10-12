/**
 * Tapping a dot on the sky map selects the satellite under it. Where to
 * tap comes from the app's own core maths, run here in Node: if the
 * projection, propagation or hit-testing drift apart, this fails.
 */
import { expect, test } from '@playwright/test'
import { fixtureSatellites } from '../src/core/fixtures/index.ts'
import { horizontalToEnu, refraction, TopocentricFrame } from '../src/core/frames.ts'
import { look } from '../src/core/look.ts'
import { PolarProjector } from '../src/sky/projection.ts'
import { appUrl, CAPE_TOWN, ISS_PASS_PEAK, serveFixtureData } from './helpers.ts'

test.use({ serviceWorkers: 'block' })

test('tapping the ISS on the map selects it', async ({ page, context }) => {
  await serveFixtureData(context)
  await page.goto(appUrl({ ...CAPE_TOWN, t: ISS_PASS_PEAK, paused: 1 }))
  const canvas = page.getByTestId('sky-canvas')
  await expect(page.getByRole('status').first()).toContainText(/\d+ visible/)

  const box = (await canvas.boundingBox())!
  const iss = fixtureSatellites().get(25544)!
  const frame = new TopocentricFrame({ latitude: CAPE_TOWN.lat, longitude: CAPE_TOWN.lon, height: 0 })
  const l = look(iss, frame, Date.parse(ISS_PASS_PEAK))!
  const pr = new PolarProjector(box.width, box.height)
  const pt = { x: 0, y: 0 }
  pr.project(horizontalToEnu(l.az, l.el + refraction(l.el)), pt)

  await expect(page.getByTestId('info-card')).toBeHidden()
  await canvas.click({ position: pt })
  await expect(page.getByTestId('info-card')).toContainText('ISS')
  // Tapping empty sky clears the selection.
  await canvas.click({ position: { x: 5, y: box.height - 5 } })
  await expect(page.getByTestId('info-card')).toBeHidden()
})
