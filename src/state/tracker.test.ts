import { describe, expect, it, vi } from 'vitest'
import type { EngineClient } from '../worker/client.ts'
import { settings, updateSettings } from './settings.ts'
import { Tracker } from './tracker.ts'

vi.stubGlobal('document', { baseURI: 'http://localhost/' })

describe('Tracker', () => {
  it('reloads the catalogue when the packs change, not on unrelated settings (zoom)', () => {
    const loads: unknown[] = []
    const client = {
      request: (type: string, body: { packs?: string[] | null }) => {
        if (type === 'load') {
          loads.push(body.packs)
          return Promise.resolve({ index: null, sats: [], epochs: [], missing: [], failed: [] })
        }
        return Promise.resolve(undefined)
      },
      terminate: () => {},
    } as unknown as EngineClient
    const t = new Tracker(client)
    const before = settings.peek()
    t.start()
    expect(loads).toHaveLength(1)
    updateSettings({ skyFovDeg: 30 })
    updateSettings({ limitingMag: 4 })
    expect(loads).toHaveLength(1)
    updateSettings({ packs: ['bright'] })
    expect(loads).toHaveLength(2)
    updateSettings({ packs: ['bright'] }) // same contents, new array
    expect(loads).toHaveLength(2)
    t.stop()
    settings.value = before
  })
})
