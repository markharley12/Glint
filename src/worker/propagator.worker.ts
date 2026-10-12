/**
 * The propagation worker: owns the satellites (their SatRecs never cross
 * to the UI thread) and answers the requests in protocol.ts.
 */
import { buildSatellites, fetchIndex, fetchPack, mergePack } from '../data/catalog.ts'
import type { DecodedRow } from '../data/pack.ts'
import { msFromJd } from '../core/satellite.ts'
import { Engine } from './engine.ts'
import type { LoadResult, Request, Response } from './protocol.ts'

const engine = new Engine()

function reply(msg: Response, transfer: Transferable[] = []): void {
  // In a worker `self.postMessage(msg, transfer)` is the signature; the
  // options form type-checks against both the DOM and worker typings.
  self.postMessage(msg, { transfer })
}

async function load(baseUrl: string, packIds: string[]): Promise<LoadResult> {
  const index = await fetchIndex(baseUrl)
  const rows = new Map<number, DecodedRow>()
  const missing: LoadResult['missing'] = []
  const wanted = index.packs.filter((p) => packIds.includes(p.id))
  // In parallel: the browser's per-host limit keeps this polite, and the
  // big Starlink pack shouldn't hold up the small ones.
  const results = await Promise.allSettled(wanted.map((p) => fetchPack(baseUrl, p.file)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') mergePack(r.value, rows)
    else missing.push({ id: wanted[i]!.id, error: String((r.reason as Error).message ?? r.reason) })
  })
  const { sats, failed } = buildSatellites(rows.values())
  engine.setSatellites(sats)
  return {
    index,
    sats: sats.map(({ satrec: _satrec, epochJd: _epochJd, ...info }) => info),
    epochs: sats.map((s) => msFromJd(s.epochJd)),
    failed,
    missing,
  }
}

async function handle(req: Request): Promise<void> {
  switch (req.type) {
    case 'load':
      return reply({ type: 'load', id: req.id, result: await load(req.baseUrl, req.packs) })
    case 'observer':
      engine.setObserver(req.observer)
      return reply({ type: 'observer', id: req.id, result: null })
    case 'tick': {
      const r = engine.tick(req.ms)
      return reply({ type: 'tick', id: req.id, result: r }, [r.buffer.buffer])
    }
    case 'look':
      return reply({ type: 'look', id: req.id, result: engine.look(req.norad, req.ms) })
    case 'passes':
      return reply({
        type: 'passes',
        id: req.id,
        result: engine.passes(req.norads, req.startMs, req.endMs, req.options, req.visibleOnly),
      })
    case 'track':
      return reply({ type: 'track', id: req.id, result: engine.track(req.norad, req.startMs, req.endMs, req.stepMs) })
  }
}

self.addEventListener('message', (e: MessageEvent<Request>) => {
  handle(e.data).catch((err: unknown) => {
    reply({ type: 'error', id: e.data.id, message: err instanceof Error ? err.message : String(err) })
  })
})
