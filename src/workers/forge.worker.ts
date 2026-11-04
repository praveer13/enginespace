/**
 * forge.worker: where a learner's wasm runs (ARCHITECTURE §8.3, §12). The module is untrusted: it is compiled, instantiated and driven
 * here and nowhere else, so an infinite loop or a runaway allocation can only stall this worker, and the page terminates it at the
 * check's time limit (src/forge/host.ts).
 *
 * It wraps kernelspace's forge host (vendor/kernelspace/src/lib/forge/{abi,run}.ts, wasm-lab.ts and workers/lab-protocol.ts, none of
 * them edited): the zero-imports rule, the ABI table, the `list` reply, a fresh instance per check, and the way a command goes in and a
 * reply comes out. What it leaves out is kernelspace's grading loop, which compiles the checks into the learner's module and runs them
 * there. Here the checks are the site's (src/forge/invoke.ts), and this worker only carries commands (src/forge/protocol.ts).
 */

import { compatFor, NEWER_TEMPLATE_NOTE } from '../../vendor/kernelspace/src/lib/forge/abi'
import { abiOf, instantiator, listChecks, type Instantiate, type LabExports } from '../../vendor/kernelspace/src/lib/forge/run'
import type { ListReply } from '../../vendor/kernelspace/src/lib/forge/types'
import { LabAbiError, LabTrapError } from '../../vendor/kernelspace/src/lib/wasm-lab'
import { capReply, invokeCall, readCallReply } from '../../vendor/kernelspace/src/workers/lab-protocol'
import { MAX_MODULE_BYTES, type ForgeReply, type ForgeRequest } from '../forge/protocol'

/* The app tsconfig has the DOM lib, not WebWorker: type just what is used. */
const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<ForgeRequest>) => void) | null
  postMessage(msg: ForgeReply): void
}

/** `ks_panic_msg` and `ks_trace_drain` are the module's own text. The kit caps them (500 characters, 16 KiB), and a module that is not the kit's may not. */
const PANIC_CHARS = 2000
const TRACE_CHARS = 20_000

let make: Instantiate | null = null
let current: LabExports | null = null

/** Compiles the module and checks what the host needs of it, and returns its own list of checks. Throws LabAbiError when it is not a lab module. */
async function load(bytes: ArrayBuffer): Promise<ListReply> {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0 || bytes.byteLength > MAX_MODULE_BYTES) {
    throw new LabAbiError('the file is empty or larger than the host reads.')
  }
  let module: WebAssembly.Module
  try {
    module = await WebAssembly.compile(bytes)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new LabAbiError(`not a loadable WebAssembly module (${detail}). Drop the .wasm that the lab's crate builds.`)
  }
  const imports = WebAssembly.Module.imports(module)
  if (imports.length > 0) {
    const names = imports.map((entry) => `${entry.module}.${entry.name}`).join(', ')
    throw new LabAbiError(`this module imports ${names}. A lab module is plain Rust on the lab's kit and imports nothing: no wasm-bindgen, and nothing from the host.`)
  }
  make = instantiator(module)
  const first = make()
  const abi = abiOf(first)
  if (abi === 1) throw new LabAbiError("this module was built from the v1 template, which cannot take seeded commands: rebuild it from the lab's kit.")
  if (compatFor(abi) === null) throw new LabAbiError(`this module speaks forge ABI ${abi}, and this page speaks 2: ${NEWER_TEMPLATE_NOTE}.`)
  if (typeof first.ks_invoke !== 'function' || typeof first.ks_alloc !== 'function' || typeof first.ks_free !== 'function') {
    throw new LabAbiError("this module has no ks_invoke bridge: rebuild it from the lab's kit.")
  }
  /* `list` runs no student code, so a trap here is a broken module and not a red check. */
  return listChecks(() => first)
}

/** `ks_panic_msg()` or `ks_trace_drain()` on an instance, or undefined when it is empty, missing or unreadable. */
function pull(ex: LabExports, name: 'ks_panic_msg' | 'ks_trace_drain', max: number): string | undefined {
  const fn = ex[name]
  if (typeof fn !== 'function') return undefined
  try {
    const text = readCallReply(ex.memory.buffer, fn())
    return text === '' ? undefined : text.slice(0, max)
  } catch {
    return undefined
  }
}

const failure = (id: number, e: unknown): ForgeReply => ({
  type: 'failed',
  id,
  kind: e instanceof LabAbiError || e instanceof LabTrapError ? 'abi' : 'error',
  message: e instanceof Error ? e.message : String(e),
})

scope.onmessage = async (event) => {
  const request = event.data
  try {
    switch (request.type) {
      case 'load': {
        const list = await load(request.bytes)
        scope.postMessage({ type: 'loaded', id: request.id, list })
        return
      }
      case 'open': {
        if (make === null) throw new Error('no module is loaded')
        current = make()
        scope.postMessage({ type: 'opened', id: request.id })
        return
      }
      case 'call': {
        if (current === null) throw new Error('no instance is open')
        const replies: string[] = []
        try {
          for (const op of request.ops) replies.push(capReply(invokeCall(current, op)))
        } catch (e) {
          if (!(e instanceof LabTrapError)) throw e
          scope.postMessage({
            type: 'trapped',
            id: request.id,
            replies,
            panic: pull(current, 'ks_panic_msg', PANIC_CHARS),
            trace: pull(current, 'ks_trace_drain', TRACE_CHARS),
          })
          return
        }
        scope.postMessage({ type: 'replied', id: request.id, replies })
        return
      }
      case 'close': {
        const trace = current === null ? undefined : pull(current, 'ks_trace_drain', TRACE_CHARS)
        current = null
        scope.postMessage({ type: 'closed', id: request.id, trace })
        return
      }
    }
  } catch (e) {
    scope.postMessage(failure(request.id, e))
  }
}

scope.postMessage({ type: 'ready' })
