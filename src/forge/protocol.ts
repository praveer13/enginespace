/*
 * The messages between the main thread and forge.worker (ARCHITECTURE §8.3, §12), and the limits that bound what a learner's file can make
 * the tab do. Types and constants only, so the client, the worker and the tests all import this and nothing here runs.
 *
 * The worker is enginespace's own and a thin one. kernelspace's lab worker (vendor/, wrapped and not edited) runs the module's own
 * checks (`ks_run`) and holds the whole grading loop in the worker. Here the oracle stays outside the learner's code (D-025), so the
 * grading loop is on the main thread (invoke.ts) and the worker does only what the untrusted module forces off it: compile it, make a
 * fresh instance, and send commands through `ks_invoke`. A module that spins or traps can only stall or lose this worker.
 *
 *   load   compile the bytes, refuse a module that imports anything, instantiate it once, and ask it to `list` its checks
 *   open   a fresh instance, replacing the last one: one instance for each check (kernelspace F1)
 *   call   one `ks_invoke` per command, in order, on the open instance; the replies come back together
 *   close  hand back the open instance's trace (`kslab::trace!`) and forget it
 */

import type { ListReply } from '../../vendor/kernelspace/src/lib/forge/types'

/**
 * The largest file the page reads. A lab module is a few dozen KB, and this bounds what a dropped file can ask a worker to compile
 * [estimated].
 */
export const MAX_MODULE_BYTES = 4 * 1024 * 1024

/** What one check may spend in the module, summed over its calls: kernelspace F1's budget [estimated]. */
export const CHECK_BUDGET_MS = 2000

/** What loading, opening and closing may take: a module whose start function never returns is stopped here [estimated]. */
export const SETUP_BUDGET_MS = 5000

export type ForgeRequest =
  | { type: 'load'; id: number; bytes: ArrayBuffer }
  | { type: 'open'; id: number }
  | { type: 'call'; id: number; ops: readonly string[] }
  | { type: 'close'; id: number }

export type ForgeReply =
  | { type: 'ready' }
  /** The module compiled with no imports, speaks ABI 2 and has the `ks_invoke` bridge; `list` is its own reply to `list`. */
  | { type: 'loaded'; id: number; list: ListReply }
  | { type: 'opened'; id: number }
  | { type: 'replied'; id: number; replies: string[] }
  /** A command trapped. `replies` are those of the commands before it; `panic` is `ks_panic_msg()` and `trace` is `ks_trace_drain()`. */
  | { type: 'trapped'; id: number; replies: string[]; panic?: string; trace?: string }
  | { type: 'closed'; id: number; trace?: string }
  /** `abi`: the module breaks the contract or is not a lab module; `error`: anything else. The message is shown to the learner as text. */
  | { type: 'failed'; id: number; kind: 'abi' | 'error'; message: string }
