/**
 * "What's that?" overlay: follow the light in the circle, then see which
 * satellites match.
 */
import { displayName } from '../core/names.ts'
import { closeIdentify, FOLLOW_SECONDS, identifyState, startIdentify } from '../state/identify.ts'
import { catalog, indexByNorad, selected } from '../state/tracker.ts'
import { magnitude } from './format.ts'

const RING_R = 44
const RING_LEN = 2 * Math.PI * RING_R

export function Identify() {
  const st = identifyState.value
  if (st.phase === 'idle') return null
  return (
    <div class="identify" data-testid="identify">
      {st.phase === 'following' && (
        <svg class="identify__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={RING_R} class="identify__track" />
          <circle
            cx="50"
            cy="50"
            r={RING_R}
            class="identify__progress"
            style={{ strokeDasharray: RING_LEN, strokeDashoffset: RING_LEN, animationDuration: `${FOLLOW_SECONDS}s` }}
          />
        </svg>
      )}
      <div class="overlay-panel" role="status">
        <Body />
      </div>
    </div>
  )
}

function Body() {
  const st = identifyState.value
  const cat = catalog.value
  const index = indexByNorad.value
  switch (st.phase) {
    case 'idle':
      return null
    case 'following':
      return (
        <>
          <p>
            <strong>Keep the moving light in the circle</strong> for {FOLLOW_SECONDS} seconds.
          </p>
          <button class="btn btn--ghost" onClick={closeIdentify}>
            Cancel
          </button>
        </>
      )
    case 'matching':
      return <p>Matching its path…</p>
    case 'failed':
      return (
        <>
          <p class="warn">{st.message}</p>
          <Actions />
        </>
      )
    case 'done': {
      if (st.still) {
        return (
          <>
            <p>
              That light wasn’t moving, so it isn’t a satellite passing over: most likely a star or planet. Tap it on screen
              to see its name.
            </p>
            <Actions />
          </>
        )
      }
      if (st.results.length === 0) {
        return (
          <>
            <p>No sunlit satellite was anywhere near there. If it blinked or had coloured lights, it was probably a plane.</p>
            <Actions />
          </>
        )
      }
      const name = (norad: number) => {
        const i = index.get(norad)
        const s = i === undefined ? undefined : cat.sats[i]
        return s ? displayName(s) : `#${norad}`
      }
      const [best, ...rest] = st.results
      const lead =
        st.confidence === 'good' ? 'That was' : st.confidence === 'fair' ? 'Probably' : 'Nothing matched well. The closest:'
      const choose = (norad: number) => {
        selected.value = norad
        closeIdentify()
      }
      return (
        <>
          <p class="identify__lead">
            {lead}{' '}
            <button class="link identify__best" onClick={() => choose(best!.norad)}>
              {name(best!.norad)}
            </button>
            {best!.mag !== null && <span class="muted"> (mag {magnitude(best!.mag)})</span>}
          </p>
          {rest.length > 0 && st.confidence !== 'good' && (
            <p class="muted small">
              Or:{' '}
              {rest.map((r, k) => (
                <span key={r.norad}>
                  {k > 0 && ', '}
                  <button class="link" onClick={() => choose(r.norad)}>
                    {name(r.norad)}
                  </button>
                </span>
              ))}
            </p>
          )}
          <Actions />
        </>
      )
    }
  }
}

function Actions() {
  return (
    <div class="row">
      <button class="btn" onClick={startIdentify}>
        Try again
      </button>
      <button class="btn btn--ghost" onClick={closeIdentify}>
        Close
      </button>
    </div>
  )
}
