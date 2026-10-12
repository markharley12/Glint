import { APP_NAME, TAGLINE } from '../../app-info.ts'
import { catalog } from '../../state/tracker.ts'
import { SHORTCUTS } from '../keyboard.ts'
import { Sheet } from '../Sheet.tsx'

export function AboutPanel() {
  const sources = catalog.value.index?.sources ?? []
  return (
    <Sheet title={`${APP_NAME} — ${TAGLINE}`} testId="about-panel">
      <p>
        {APP_NAME} shows the satellites above you: on a sky map, in a planetarium you can drag around, or through your phone’s camera. Tap a dot to find out
        what it is and when it will next pass over.
      </p>
      <h3>How to see one</h3>
      <ul>
        <li>Satellites shine by reflected sunlight, so look in the hour or two after sunset or before dawn: the sky is dark, but sunlight still reaches them hundreds of kilometres up.</li>
        <li>The Passes list shows the brightest coming over. The ISS is the easiest — brighter than any star, crossing the sky in about five minutes.</li>
        <li>A steady, silent moving dot is a satellite. Blinking lights are an aircraft.</li>
        <li>A line of dots one after another is a Starlink “train”, days or weeks after launch.</li>
      </ul>
      <h3>Accuracy</h3>
      <p>
        Positions come from public orbital elements and the standard SGP4 model, checked against the Skyfield library to within a few arcseconds. In AR, your
        phone’s compass is the weak link — often 5–15° out. Calibrate on the Moon, a planet or a bright star to fix it.
      </p>
      <details>
        <summary>Keyboard shortcuts</summary>
        <table class="shortcuts small">
          <tbody>
            {SHORTCUTS.map(([keys, what]) => (
              <tr key={keys}>
                <th scope="row">
                  <kbd>{keys}</kbd>
                </th>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <h3>Credits</h3>
      <ul class="small">
        {sources.map((s) => (
          <li key={s}>{s}</li>
        ))}
        <li>Stars: Yale Bright Star Catalogue (Hoffleit &amp; Warren), via CDS VizieR.</li>
        <li>Constellation lines: d3-celestial by Olaf Frohn (BSD-3-Clause).</li>
        <li>Propagation: satellite.js (MIT). Sun, Moon and planets: Astronomy Engine by Don Cross (MIT). Magnetic declination: World Magnetic Model 2025 (NOAA/BGS) via geomagnetism.</li>
      </ul>
      <p class="muted small">Open source under the MIT licence. Nothing you do here leaves your device.</p>
    </Sheet>
  )
}
