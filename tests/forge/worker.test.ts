/*
 * W1-T10: the forge host with the real forge.worker and real WebAssembly. The modules are assembled by tests/forge/wasm.ts, so none of
 * this needs a Rust toolchain: a module that echoes, one that traps with a panic text, one that never returns, a reference build, and a
 * handful that break the contract in the ways a learner's file can. What the host does with a module that Rust builds is tested in
 * tests/forge/toy-wasm.test.ts and by verify:labs.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import path from 'node:path'
import { createHost, type ForgeHost } from '../../src/forge/host'
import { MAX_MODULE_BYTES } from '../../src/forge/protocol'
import { browserPool } from '../../src/forge/worker-pool'
import { LabAbiError } from '../../vendor/kernelspace/src/lib/wasm-lab'
import { buildLabModule, toBuffer, type ModuleSpec } from './wasm'

let host: ForgeHost | null = null
afterEach(() => {
  host?.dispose()
  host = null
})

function load(spec: ModuleSpec) {
  host = createHost({ pool: browserPool() })
  return host.load(toBuffer(buildLabModule(spec)))
}

describe('the assembler', () => {
  test('builds modules that WebAssembly accepts, with the exports of the kit', () => {
    for (const spec of [{}, { invoke: 'trap' as const }, { invoke: 'spin' as const }, { invoke: { constant: 'ok' } }, { imports: true }]) {
      expect(WebAssembly.validate(buildLabModule(spec)), JSON.stringify(spec)).toBe(true)
    }
    const names = WebAssembly.Module.exports(new WebAssembly.Module(buildLabModule())).map((e) => e.name)
    expect(names).toEqual(expect.arrayContaining(['memory', 'ks_alloc', 'ks_free', 'ks_run', 'ks_invoke', 'ks_abi_version', 'ks_panic_msg', 'ks_trace_drain']))
  })
})

describe('a module that behaves', () => {
  test('is loaded with its SHA-256 and its own list of checks, and answers commands through ks_invoke, one reply each, in order', async () => {
    const bytes = buildLabModule({ lab: 'toy', version: 4 })
    const loaded = await load({ lab: 'toy', version: 4 })
    expect(loaded).toMatchObject({ lab: 'toy', reference: false, version: 4, bytes: bytes.length })
    expect(loaded.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(loaded.list.checks.map((c) => c.id)).toEqual(['one', 'two'])
    const session = await (host as ForgeHost).open()
    expect(await session.call(['init 3', 'touch 1', 'order'], 2000)).toEqual({ kind: 'replies', replies: ['init 3', 'touch 1', 'order'] })
    expect(await session.close()).toBeUndefined()
  })

  test('a reference build is named by its suffix', async () => {
    expect(await load({ lab: 'toy@reference' })).toMatchObject({ lab: 'toy', reference: true })
  })

  test('a reply is cut to 4 KiB, whatever the module sends', async () => {
    await load({ invoke: { constant: 'a'.repeat(5000) } })
    const session = await (host as ForgeHost).open()
    const outcome = await session.call(['x'], 2000)
    expect(outcome.kind === 'replies' && outcome.replies[0].length).toBe(4096)
  })
})

describe('a module that traps', () => {
  test('reports the panic text and the trace that the module leaves, and the replies before the trap', async () => {
    await load({ invoke: 'trap', panic: 'panicked at toy/src/rotation.rs:31:9: not yet implemented: build the rotation', trace: 'alloc(3) -> 8' })
    const session = await (host as ForgeHost).open()
    expect(await session.call(['init 3'], 2000)).toEqual({
      kind: 'trap',
      replies: [],
      panic: 'panicked at toy/src/rotation.rs:31:9: not yet implemented: build the rotation',
      trace: 'alloc(3) -> 8',
    })
  })

  test('a trap with no panic text is a trap all the same', async () => {
    await load({ invoke: 'trap' })
    const outcome = await (await (host as ForgeHost).open()).call(['x'], 2000)
    expect(outcome).toMatchObject({ kind: 'trap', replies: [] })
  })
})

describe('a module that never returns', () => {
  test('is stopped at the limit it was given, the call says timeout, and the next instance is made in a new worker', async () => {
    // In a process of its own: bun cannot stop the thread of a worker that spins, so the process must end to end it (spin-case.ts).
    const proc = Bun.spawn([process.execPath, path.join(import.meta.dirname, 'spin-case.ts'), 'worker-spin'], { stdout: 'pipe', stderr: 'pipe' })
    const out = await new Response(proc.stdout).text()
    expect(await proc.exited, await new Response(proc.stderr).text()).toBe(0)
    const result = JSON.parse(out) as { first: { kind: string; ms: number }; second: { kind: string } }
    expect(result.first.kind).toBe('timeout')
    expect(result.first.ms).toBeGreaterThanOrEqual(290)
    expect(result.first.ms).toBeLessThan(2500)
    expect(result.second.kind).toBe('timeout')
  }, 30_000)
})

describe('a file that is not a lab module', () => {
  const refused = async (spec: ModuleSpec | ArrayBuffer): Promise<string> => {
    host = createHost({ pool: browserPool() })
    try {
      await host.load(spec instanceof ArrayBuffer ? spec : toBuffer(buildLabModule(spec)))
    } catch (e) {
      expect(e).toBeInstanceOf(LabAbiError)
      return (e as Error).message
    }
    throw new Error('the host loaded it')
  }

  test('with an import is refused by name: a lab module imports nothing', async () => {
    expect(await refused({ imports: true })).toMatch(/imports env\.host_call/)
  })

  test('without ks_invoke is refused: there is nothing to send commands to', async () => {
    expect(await refused({ omit: ['ks_invoke'] })).toMatch(/no ks_invoke bridge/)
  })

  test('without an ABI version is the v1 template, and is refused with the way out', async () => {
    expect(await refused({ abi: null })).toMatch(/v1 template/)
  })

  test('with a newer ABI than the page speaks is refused, and told to reload', async () => {
    expect(await refused({ abi: 3 })).toMatch(/ABI 3.*this page speaks 2.*reload/)
  })

  test('without memory or ks_run is not a lab at all', async () => {
    expect(await refused({ omit: ['ks_run'] })).toMatch(/not a kernelspace lab/)
    expect(await refused({ omit: ['memory'] })).toMatch(/not a kernelspace lab/)
  })

  test('that begins like WebAssembly and is not is refused with the engine\'s reason', async () => {
    const broken = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0xff, 0xff])
    expect(await refused(toBuffer(broken))).toMatch(/not a loadable WebAssembly module/)
  })

  test('that is text is refused before a worker sees it, and so is a file past the limit', async () => {
    expect(await refused(new TextEncoder().encode('fn main() {}').buffer as ArrayBuffer)).toMatch(/does not begin with \\0asm/)
    expect(await refused(new ArrayBuffer(MAX_MODULE_BYTES + 1))).toMatch(/larger than the host reads/)
  })
})
