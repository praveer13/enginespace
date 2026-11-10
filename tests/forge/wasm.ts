/*
 * A WebAssembly assembler just big enough to build the lab modules that the host's tests need without a Rust toolchain: a module with
 * the kit's exports (`memory`, `ks_alloc`, `ks_free`, `ks_abi_version`, `ks_run`, `ks_invoke`, `ks_panic_msg`, `ks_trace_drain`) whose
 * `ks_invoke` echoes, answers a constant, traps or never returns. The real lab modules are built by cargo (labs/forge, verify:labs);
 * these stand in for the behaviours that a test needs to provoke on demand: a spin, a trap with a panic text, a reference name, an
 * import, an old ABI. The bytes are written by hand against the binary format (WebAssembly core spec, section 5), and
 * `WebAssembly.validate` is the judge in the tests.
 */

const encoder = new TextEncoder()

/** Unsigned LEB128. */
function u(value: number | bigint): number[] {
  let v = BigInt(value)
  const out: number[] = []
  do {
    let byte = Number(v & 0x7fn)
    v >>= 7n
    if (v !== 0n) byte |= 0x80
    out.push(byte)
  } while (v !== 0n)
  return out
}

/** Signed LEB128. */
function s(value: number | bigint): number[] {
  let v = BigInt(value)
  const out: number[] = []
  for (;;) {
    const byte = Number(v & 0x7fn)
    v >>= 7n
    const done = (v === 0n && (byte & 0x40) === 0) || (v === -1n && (byte & 0x40) !== 0)
    out.push(done ? byte : byte | 0x80)
    if (done) return out
  }
}

const vec = (items: number[][]): number[] => [...u(items.length), ...items.flat()]
const name = (text: string): number[] => [...u(encoder.encode(text).length), ...encoder.encode(text)]
const section = (id: number, body: number[]): number[] => [id, ...u(body.length), ...body]

const I32 = 0x7f
const I64 = 0x7e

/** A function type: parameters and results. */
const type = (params: number[], results: number[]): number[] => [0x60, ...u(params.length), ...params, ...u(results.length), ...results]

/** Opcodes that the bodies use. */
const OP = { end: 0x0b, unreachable: 0x00, loop: 0x03, br: 0x0c, i32const: 0x41, i64const: 0x42, localGet: 0x20, i64extendU: 0xad, i64shl: 0x86, i64or: 0x84 }

export interface CheckSpec {
  id: string
  label: string
  stage: number
  seeded: boolean
}

export type InvokeBehaviour = 'echo' | 'trap' | 'spin' | { constant: string }

export interface ModuleSpec {
  /** The lab id the module lists, `toy@reference` for a reference build. */
  lab?: string
  version?: number
  checks?: readonly CheckSpec[]
  invoke?: InvokeBehaviour
  /** The text `ks_panic_msg` returns, as the kit writes it: `panicked at src/rotation.rs:31:9: not yet implemented: …`. */
  panic?: string
  /** The text `ks_trace_drain` returns. */
  trace?: string
  /** The `ks_abi_version` export: its value, or null for a module with none (ABI 1). Default 2. */
  abi?: number | null
  /** Exports to leave out, by name. */
  omit?: readonly string[]
  /** Adds an import, so that the module cannot be instantiated with none. */
  imports?: boolean
}

const DEFAULT_CHECKS: readonly CheckSpec[] = [
  { id: 'one', label: 'the first check', stage: 1, seeded: false },
  { id: 'two', label: 'the second check', stage: 2, seeded: true },
]

/** Where the host's input lands (`ks_alloc`), and where the texts sit. The first page is 64 KiB. */
const SCRATCH = 32768
const TEXTS = 1024

/** The JSON that `ks_run` answers to `list`. */
export function listJson(lab: string, version: number, checks: readonly CheckSpec[]): string {
  return JSON.stringify({ lab, version, abi: 2, checks })
}

export function buildLabModule(spec: ModuleSpec = {}): Uint8Array<ArrayBuffer> {
  const lab = spec.lab ?? 'lab'
  const checks = spec.checks ?? DEFAULT_CHECKS
  const invoke = spec.invoke ?? 'echo'
  const texts = [listJson(lab, spec.version ?? 1, checks), spec.panic ?? '', spec.trace ?? '', typeof invoke === 'object' ? invoke.constant : '']
  const offsets: number[] = []
  let at = TEXTS
  for (const text of texts) {
    offsets.push(at)
    at += encoder.encode(text).length
  }
  if (at > SCRATCH) throw new RangeError('the texts of the module do not fit before the scratch area')
  const packed = (index: number): bigint => {
    const length = encoder.encode(texts[index]).length
    return length === 0 ? 0n : (BigInt(offsets[index]) << 32n) | BigInt(length)
  }

  // Types: 0 (i32) -> i32, 1 (i32, i32) -> (), 2 () -> i32, 3 (i32, i32) -> i64, 4 () -> i64.
  const types = [type([I32], [I32]), type([I32, I32], []), type([], [I32]), type([I32, I32], [I64]), type([], [I64])]

  // The functions this module defines, in order: name, type, body.
  const constant64 = (value: bigint): number[] => [OP.i64const, ...s(value), OP.end]
  const echo = [OP.localGet, 0, OP.i64extendU, OP.i64const, ...s(32), OP.i64shl, OP.localGet, 1, OP.i64extendU, OP.i64or, OP.end]
  const invokeBody =
    invoke === 'echo'
      ? echo
      : invoke === 'trap'
        ? [OP.unreachable, OP.end]
        : invoke === 'spin'
          ? [OP.loop, 0x40, OP.br, 0, OP.end, OP.i64const, 0, OP.end]
          : constant64(packed(3))
  const defined: { export: string; type: number; body: number[] }[] = [
    { export: 'ks_alloc', type: 0, body: [OP.i32const, ...s(SCRATCH), OP.end] },
    { export: 'ks_free', type: 1, body: [OP.end] },
    { export: 'ks_run', type: 3, body: constant64(packed(0)) },
    { export: 'ks_invoke', type: 3, body: invokeBody },
    { export: 'ks_panic_msg', type: 4, body: constant64(packed(1)) },
    { export: 'ks_trace_drain', type: 4, body: constant64(packed(2)) },
  ]
  if (spec.abi !== null) defined.push({ export: 'ks_abi_version', type: 2, body: [OP.i32const, ...s(spec.abi ?? 2), OP.end] })
  const kept = defined.filter((fn) => !(spec.omit ?? []).includes(fn.export))

  const imported = spec.imports === true ? 1 : 0
  const parts: number[][] = [[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], section(1, vec(types))]
  if (imported === 1) parts.push(section(2, vec([[...name('env'), ...name('host_call'), 0x00, ...u(1)]])))
  parts.push(section(3, vec(kept.map((fn) => u(fn.type)))))
  parts.push(section(5, vec([[0x00, ...u(1)]])))
  const exports = kept.map((fn, i) => [...name(fn.export), 0x00, ...u(imported + i)])
  if (!(spec.omit ?? []).includes('memory')) exports.push([...name('memory'), 0x02, ...u(0)])
  parts.push(section(7, vec(exports)))
  parts.push(section(10, vec(kept.map((fn) => [...u(fn.body.length + 1), 0x00, ...fn.body]))))
  const data = texts.flatMap((text, i) => (text === '' ? [] : [[0x00, OP.i32const, ...s(offsets[i]), OP.end, ...u(encoder.encode(text).length), ...encoder.encode(text)]]))
  parts.push(section(11, vec(data)))
  return Uint8Array.from(parts.flat())
}

/** The bytes as the ArrayBuffer that the host takes. */
export function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
