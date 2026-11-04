/*
 * Where forge.worker comes from: the browser's own pool, one module worker at a time. host.ts takes any pool, so its tests drive it with
 * a fake one, and this file is the only place that names the worker's file. Vite bundles the worker at `new URL(…, import.meta.url)`,
 * and bun runs the same line against the source file, so a script and a test run the worker the site runs.
 */

import type { ForgePool, ForgePort } from './host'
import type { ForgeReply, ForgeRequest } from './protocol'

function spawn(): { port: ForgePort; ready: Promise<void>; worker: Worker } {
  const worker = new Worker(new URL('../workers/forge.worker.ts', import.meta.url), { type: 'module' })
  const ready = new Promise<void>((resolve, reject) => {
    const onMessage = (event: MessageEvent<ForgeReply>) => {
      if (event.data.type !== 'ready') return
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      reject(new Error('the forge worker failed to start'))
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
  })
  const port: ForgePort = {
    /* No transfer list: the host keeps the bytes, to load them again into the worker that replaces a stopped one. */
    post: (request: ForgeRequest) => worker.postMessage(request),
    subscribe(onMessage, onCrash) {
      const message = (event: MessageEvent<ForgeReply>) => onMessage(event.data)
      const error = (event: ErrorEvent) => onCrash(event.message || 'the forge worker stopped')
      worker.addEventListener('message', message)
      worker.addEventListener('error', error)
      return () => {
        worker.removeEventListener('message', message)
        worker.removeEventListener('error', error)
      }
    },
  }
  return { port, ready, worker }
}

/** The pool of a page: a worker is spawned on the first use, and replaced whenever the host discards one. */
export function browserPool(): ForgePool {
  const workers = new Map<ForgePort, Worker>()
  return {
    async acquire() {
      const { port, ready, worker } = spawn()
      workers.set(port, worker)
      try {
        await ready
      } catch (e) {
        worker.terminate()
        workers.delete(port)
        throw e
      }
      return port
    },
    discard(port) {
      workers.get(port)?.terminate()
      workers.delete(port)
    },
  }
}
