/*
 * Where receipt.worker comes from: the browser's own, one module worker for each check. A check is one file, so the worker is made for it and
 * stopped when it has answered: nothing a hostile file did to a worker (memory it grew, a loop it started) outlives the check, and there is no
 * state to carry from one file to the next. Vite bundles the worker at `new URL(…, import.meta.url)`, and bun runs the same line against the
 * source file, so a test runs the worker the site runs.
 *
 * `verifierOn` takes any way of making a worker, so its tests drive it with a fake one that never answers, answers late, or crashes; this file's
 * `verifyInWorker` is the real one, and the only place that names the worker's file.
 */
import { CHECK_BUDGET_MS } from './protocol'
import type { ReceiptReply, ReceiptRequest, Verifier } from './protocol'

/** One worker, as the client sees it. */
export interface ReceiptPort {
  post(request: ReceiptRequest): void
  /** Starts listening. `onCrash` fires when the worker itself dies, with the browser's own message. */
  listen(onReply: (reply: ReceiptReply) => void, onCrash: (message: string) => void): void
  /** Ends the worker, whatever it is doing. */
  stop(): void
}

function spawn(): ReceiptPort {
  const worker = new Worker(new URL('../workers/receipt.worker.ts', import.meta.url), { type: 'module' })
  return {
    post: (request) => worker.postMessage(request),
    listen(onReply, onCrash) {
      worker.addEventListener('message', (event: MessageEvent<ReceiptReply>) => onReply(event.data))
      worker.addEventListener('error', (event: ErrorEvent) => onCrash(event.message || 'the receipt worker stopped'))
    },
    stop: () => worker.terminate(),
  }
}

/** A check on a worker made by `make`, which gives up after `budgetMs` and stops the worker. Rejects with a sentence for the learner. */
export function verifierOn(make: () => ReceiptPort, budgetMs: number = CHECK_BUDGET_MS): Verifier {
  return (file, context) =>
    new Promise((resolve, reject) => {
      const REQUEST = 1
      let port: ReceiptPort
      try {
        port = make()
      } catch (error) {
        reject(new Error(`This browser could not start the worker that checks a receipt: ${error instanceof Error ? error.message : String(error)}`))
        return
      }
      let settled = false
      const finish = (act: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        port.stop()
        act()
      }
      const timer = setTimeout(() => finish(() => reject(new Error(`The check took longer than ${budgetMs / 1000} seconds, so it was stopped. Nothing was kept.`))), budgetMs)
      port.listen(
        (reply) => {
          if (reply.type === 'ready') port.post({ type: 'verify', id: REQUEST, file, context })
          else if (reply.id === REQUEST) finish(() => (reply.type === 'verified' ? resolve(reply.outcome) : reject(new Error(reply.message))))
        },
        (message) => finish(() => reject(new Error(`The worker that checks a receipt stopped: ${message}`))),
      )
    })
}

/** The check, on the browser's own worker. */
export const verifyInWorker: Verifier = verifierOn(spawn)
