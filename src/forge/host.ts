/*
 * The forge host, on the main thread (ARCHITECTURE §8.3, D-025). It holds a learner's module in a worker, hands out a fresh instance for
 * each check, carries commands to it and replies back, and stops it when a check runs past its time. It wraps kernelspace's host
 * (vendor/kernelspace/src/lib/forge/, never edited): that host's zero-imports rule, its ABI table, its `list` reply and its error
 * classes are the contract, and this file adds only what the oracle's place needs, which is a worker that takes commands.
 *
 *   load   hash the file, check it begins like WebAssembly, and have the worker compile it and `list` its checks
 *   open   a fresh instance: the host makes one for every check, so nothing one check left behind reaches the next
 *   call   a batch of commands to the open instance, within the time the check has left
 *
 * A module that does not answer in time is not waited for. The worker is terminated, the call reports `timeout`, and the next `open` starts
 * a new worker and loads the same bytes into it, so one spinning check costs that check and nothing else (kernelspace F1).
 *
 * The pool and the timers come in as parameters, as kernelspace's driver takes them, so tests drive the host with a fake worker and a
 * fake clock. worker-pool.ts holds the real pool.
 */

import { splitLabId } from '../../vendor/kernelspace/src/lib/forge/abi'
import type { Timers } from '../../vendor/kernelspace/src/lib/forge/run'
import type { ListReply } from '../../vendor/kernelspace/src/lib/forge/types'
import { LabAbiError, LabTimeoutError } from '../../vendor/kernelspace/src/lib/wasm-lab'
import { MAX_MODULE_BYTES, SETUP_BUDGET_MS, type ForgeReply, type ForgeRequest } from './protocol'
import { sha256Hex } from './sha256'

/** One worker, as the host sees it. */
export interface ForgePort {
  post(request: ForgeRequest): void
  /** Returns the unsubscribe. `onCrash` fires when the worker itself dies. */
  subscribe(onMessage: (reply: ForgeReply) => void, onCrash: (message: string) => void): () => void
}

/** Where ports come from: `acquire` spawns a worker that has said it is ready; `discard` terminates it. */
export interface ForgePool {
  acquire(): Promise<ForgePort>
  discard(port: ForgePort): void
}

export type { Timers }

export const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** A module the host has loaded: what the page shows about it before any check runs. */
export interface LoadedModule {
  /** Lowercase hex SHA-256 of the file: the module's name in the ledger. */
  sha256: string
  /** The file's size in bytes. */
  bytes: number
  /** The module's lab id, without `@reference`. */
  lab: string
  /** Built with `--features reference`: shown, never credited (ARCHITECTURE §8.3). */
  reference: boolean
  /** The lab's content version, as the module reports it. */
  version: number
  /** The module's own `list` reply: its lab id as built, and its checks. */
  list: ListReply
}

/** What a batch of commands came to. */
export type CallOutcome =
  | { kind: 'replies'; replies: string[] }
  /** A command trapped: `replies` answer the commands before it, `panic` is the module's panic text and `trace` its trace. */
  | { kind: 'trap'; replies: string[]; panic?: string; trace?: string }
  /** The check's time ran out inside the module. The worker has been stopped, and this session is over. */
  | { kind: 'timeout' }

/** One fresh instance of the loaded module. */
export interface ForgeSession {
  /** Sends the commands in order, one `ks_invoke` each, and waits at most `budgetMs` for all the replies. Throws LabAbiError when the module breaks the ABI. */
  call(commands: readonly string[], budgetMs: number): Promise<CallOutcome>
  /** Ends the instance and returns its trace, if it left one. It never throws. */
  close(): Promise<string | undefined>
}

export interface ForgeHost {
  /** Hashes the file and loads it. Throws LabAbiError when it is not a lab module, and LabTimeoutError when loading never ends. */
  load(bytes: ArrayBuffer): Promise<LoadedModule>
  /** A fresh instance of the loaded module, in a new worker if the last one was stopped. */
  open(): Promise<ForgeSession>
  /** Stops the worker. The host can load again afterwards. */
  dispose(): void
}

export interface HostOptions {
  pool: ForgePool
  timers?: Timers
}

const TIMEOUT = Symbol('timeout')
type Answer = Exclude<ForgeReply, { type: 'ready' }>

/** `\0asm`, the four bytes every WebAssembly file begins with. */
export function hasWasmMagic(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  return head.length === 4 && head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d
}

export function createHost({ pool, timers = realTimers }: HostOptions): ForgeHost {
  let nextId = 0
  /** The worker that holds the loaded module, or null before the first load and after a worker was stopped. */
  let port: ForgePort | null = null
  /** The loaded bytes, kept so a replacement worker can load them again. */
  let loaded: ArrayBuffer | null = null
  /** Which session is current: opening a new one ends the last. */
  let generation = 0

  const forget = (target: ForgePort) => {
    pool.discard(target)
    if (port === target) port = null
  }

  /** One request and its reply, within `budgetMs`. A worker that outlasts the budget is discarded, and the answer is TIMEOUT. */
  function exchange(target: ForgePort, build: (id: number) => ForgeRequest, budgetMs: number): Promise<Answer | typeof TIMEOUT> {
    return new Promise((resolve, reject) => {
      const id = nextId++
      let unsubscribe = () => {}
      const timer = timers.set(() => {
        unsubscribe()
        forget(target)
        resolve(TIMEOUT)
      }, budgetMs)
      unsubscribe = target.subscribe(
        (reply) => {
          if (reply.type === 'ready' || reply.id !== id) return
          timers.clear(timer)
          unsubscribe()
          resolve(reply)
        },
        (message) => {
          timers.clear(timer)
          unsubscribe()
          forget(target)
          reject(new Error(message || 'the forge worker stopped'))
        },
      )
      target.post(build(id))
    })
  }

  /** Turns a worker's `failed` reply into the error the learner reads. */
  function refusal(reply: Extract<Answer, { type: 'failed' }>): Error {
    return reply.kind === 'abi' ? new LabAbiError(reply.message) : new Error(reply.message)
  }

  /** The worker that holds the module, started and loaded again if the last was stopped. */
  async function ready(): Promise<ForgePort> {
    if (loaded === null) throw new Error('no module is loaded')
    if (port !== null) return port
    const fresh = await pool.acquire()
    port = fresh
    const bytes = loaded
    try {
      const reply = await exchange(fresh, (id) => ({ type: 'load', id, bytes }), SETUP_BUDGET_MS)
      if (reply === TIMEOUT) throw new LabTimeoutError(SETUP_BUDGET_MS, 'checks')
      if (reply.type === 'failed') throw refusal(reply)
      return fresh
    } catch (e) {
      // A worker that has not taken the module is not one to open instances in: the next try starts again from a new one.
      forget(fresh)
      throw e
    }
  }

  async function load(bytes: ArrayBuffer): Promise<LoadedModule> {
    if (bytes.byteLength > MAX_MODULE_BYTES) {
      throw new LabAbiError(`the file is larger than the host reads (${MAX_MODULE_BYTES} bytes). A lab module is a few dozen KB: drop the .wasm that the lab's crate builds.`)
    }
    if (!hasWasmMagic(bytes)) {
      throw new LabAbiError('this is not a WebAssembly file: it does not begin with \\0asm. Drop the .wasm that `cargo build --release --target wasm32-unknown-unknown` writes.')
    }
    const sha256 = await sha256Hex(bytes)
    if (port !== null) forget(port)
    generation += 1
    loaded = null
    const target = await pool.acquire()
    port = target
    const reply = await exchange(target, (id) => ({ type: 'load', id, bytes }), SETUP_BUDGET_MS)
    if (reply === TIMEOUT) throw new LabTimeoutError(SETUP_BUDGET_MS, 'checks')
    if (reply.type === 'failed') {
      forget(target)
      throw refusal(reply)
    }
    if (reply.type !== 'loaded') throw new Error(`the forge worker answered ${reply.type} to load`)
    loaded = bytes
    const { lab, reference } = splitLabId(reply.list.lab)
    return { sha256, bytes: bytes.byteLength, lab, reference, version: reply.list.version, list: reply.list }
  }

  async function open(): Promise<ForgeSession> {
    const target = await ready()
    const mine = (generation += 1)
    const reply = await exchange(target, (id) => ({ type: 'open', id }), SETUP_BUDGET_MS)
    if (reply === TIMEOUT) throw new LabTimeoutError(SETUP_BUDGET_MS, 'checks')
    if (reply.type === 'failed') throw refusal(reply)
    /** The session is live while it is the current one and its worker is the host's. */
    const live = () => generation === mine && port === target

    return {
      async call(commands, budgetMs) {
        if (!live()) throw new Error('this instance is over: open a new one')
        const answer = await exchange(target, (id) => ({ type: 'call', id, ops: commands }), budgetMs)
        if (answer === TIMEOUT) return { kind: 'timeout' }
        switch (answer.type) {
          case 'replied':
            return { kind: 'replies', replies: answer.replies }
          case 'trapped':
            return { kind: 'trap', replies: answer.replies, panic: answer.panic, trace: answer.trace }
          case 'failed':
            throw refusal(answer)
          default:
            throw new Error(`the forge worker answered ${answer.type} to call`)
        }
      },
      async close() {
        if (!live()) return undefined
        try {
          const answer = await exchange(target, (id) => ({ type: 'close', id }), SETUP_BUDGET_MS)
          return answer !== TIMEOUT && answer.type === 'closed' ? answer.trace : undefined
        } catch {
          return undefined
        }
      },
    }
  }

  return {
    load,
    open,
    dispose() {
      if (port !== null) forget(port)
      loaded = null
      generation += 1
    },
  }
}
