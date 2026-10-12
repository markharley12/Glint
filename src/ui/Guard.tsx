/**
 * An error boundary: a bug in one part of the interface shows a message
 * with a way out instead of blanking the whole app.
 */
import type { ComponentChildren } from 'preact'
import { useErrorBoundary } from 'preact/hooks'

export function Guard({ children, onReset }: { children: ComponentChildren; onReset?: () => void }) {
  // Preact types the caught value as any; it is whatever was thrown.
  const [caught, reset] = useErrorBoundary((e: unknown) => console.error(e)) as [unknown, () => void]
  if (!caught) return <>{children}</>
  const message = caught instanceof Error ? caught.message : typeof caught === 'string' ? caught : 'An unexpected error.'
  return (
    <div class="sheet-backdrop sheet-backdrop--solid">
      <section class="sheet crash" role="alert">
        <h2>Something went wrong</h2>
        <p class="muted small">{message}</p>
        <div class="row">
          <button class="btn" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            class="btn btn--ghost"
            onClick={() => {
              onReset?.()
              reset()
            }}
          >
            Carry on
          </button>
        </div>
      </section>
    </div>
  )
}
