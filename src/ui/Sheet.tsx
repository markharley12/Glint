/** A panel that slides up over the sky on phones and sits at the side on
 *  wide screens. Escape or the close button dismisses it. */
import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { panel } from '../state/view.ts'
import { Icon } from './Icon.tsx'

export function Sheet({ title, children, testId }: { title: string; children: ComponentChildren; testId?: string }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') panel.value = 'none'
    }
    window.addEventListener('keydown', onKey)
    // Move focus into the sheet for keyboard and screen-reader users.
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && (panel.value = 'none')}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} data-testid={testId}>
        <header class="sheet__head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={() => (panel.value = 'none')} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div class="sheet__body">{children}</div>
      </section>
    </div>
  )
}
