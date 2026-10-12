/**
 * The AR pipeline end to end, driven by synthetic orientation events: the
 * test "holds the phone" along the ISS's path and the app should say that
 * was the ISS. This exercises everything between the sensor event and the
 * answer — Euler angles to quaternion, screen rotation, smoothing, magnetic
 * declination, the camera direction, and the worker's path matching — so a
 * sign error anywhere shows up as a wrong (or unsure) identification.
 */
import { expect, test } from '@playwright/test'
import { declination } from '../src/core/declination.ts'
import { fixtureSatellites } from '../src/core/fixtures/index.ts'
import { refraction, TopocentricFrame } from '../src/core/frames.ts'
import { look } from '../src/core/look.ts'
import { appUrl, CAPE_TOWN, ISS_PASS_PEAK, serveFixtureData } from './helpers.ts'

test.use({ serviceWorkers: 'block' })

test('"What’s that?" identifies the ISS from following it', async ({ page, context }) => {
  await serveFixtureData(context)
  const start = Date.parse(ISS_PASS_PEAK) - 20_000
  const observer = { latitude: CAPE_TOWN.lat, longitude: CAPE_TOWN.lon, height: 0 }
  const frame = new TopocentricFrame(observer)
  const iss = fixtureSatellites().get(25544)!
  // Sensors report magnetic headings; the app adds the declination back.
  const decl = declination(observer.latitude, observer.longitude, 0, new Date(start))

  // Device poses (alpha, beta, gamma) every 100 ms that aim the back camera
  // at the ISS: upright portrait phone, tilted back by the elevation.
  const poses: [number, number, number][] = []
  for (let k = 0; k <= 600; k++) {
    const l = look(iss, frame, start + k * 100)!
    const heading = l.az - decl
    poses.push([(((360 - heading) % 360) + 360) % 360, 90 + l.el + refraction(l.el), 0])
  }

  await page.addInitScript((poses: [number, number, number][]) => {
    // No Generic Sensor API, so the app listens for orientation events.
    delete (window as { AbsoluteOrientationSensor?: unknown }).AbsoluteOrientationSensor
    const t0 = performance.now()
    setInterval(() => {
      const [alpha, beta, gamma] = poses[Math.min(poses.length - 1, Math.round((performance.now() - t0) / 100))]!
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha, beta, gamma, absolute: true }))
    }, 16)
  }, poses)

  await page.goto(appUrl({ ...CAPE_TOWN, t: new Date(start).toISOString(), view: 'ar' }))
  await page.getByTestId('start-ar').click()
  await page.getByTestId('identify-start').click()
  await expect(page.getByTestId('identify')).toContainText('Keep the moving light in the circle')
  await expect(page.getByTestId('identify')).toContainText('That was ISS', { timeout: 15_000 })
  await page.getByRole('button', { name: 'ISS' }).click()
  await expect(page.getByTestId('info-card')).toContainText('ISS')
})
