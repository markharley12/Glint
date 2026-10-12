/**
 * The UI thread's handle on the propagation worker: typed requests that
 * return promises.
 */
import type { Request, RequestBody, Response, ResultMap } from './protocol.ts'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export class EngineClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, Pending>()

  constructor(worker: Worker = new Worker(new URL('./propagator.worker.ts', import.meta.url), { type: 'module' })) {
    this.worker = worker
    this.worker.addEventListener('message', (e: MessageEvent<Response>) => {
      const p = this.pending.get(e.data.id)
      if (!p) return
      this.pending.delete(e.data.id)
      if (e.data.type === 'error') p.reject(new Error(e.data.message))
      else p.resolve(e.data.result)
    })
    this.worker.addEventListener('error', (e) => {
      // A crash in the worker fails every request in flight rather than
      // leaving them hanging.
      const err = new Error(e.message || 'Propagation worker crashed')
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
    })
  }

  request<K extends Request['type']>(type: K, body: RequestBody<K>): Promise<ResultMap[K]> {
    const id = this.nextId++
    return new Promise<ResultMap[K]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.worker.postMessage({ ...body, type, id })
    })
  }

  terminate(): void {
    this.worker.terminate()
    for (const p of this.pending.values()) p.reject(new Error('Engine stopped'))
    this.pending.clear()
  }
}
