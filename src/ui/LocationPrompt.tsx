/** First run: the sky depends on where you stand, so ask before anything. */
import { APP_NAME, TAGLINE } from '../app-info.ts'
import { LocationForm } from './LocationForm.tsx'

export function LocationPrompt() {
  return (
    <div class="sheet-backdrop sheet-backdrop--solid">
      <section class="sheet sheet--center" role="dialog" aria-modal="true" aria-labelledby="loc-title" data-testid="location-prompt">
        <h2 id="loc-title">
          {APP_NAME}: {TAGLINE}
        </h2>
        <p>To show your sky, {APP_NAME} needs to know roughly where you are.</p>
        <LocationForm />
      </section>
    </div>
  )
}
