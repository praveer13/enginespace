/*
 * What every function of the Math object returns over a fixed set of inputs, so that two engines can be compared (ARCHITECTURE §5.1).
 * A§5.1 bans the functions that ECMA-262 does not precisely specify, because each engine computes them with its own maths library,
 * and allows the rest, which the standard specifies exactly. This is how both halves are looked at.
 *
 *   bun tests/lint/math-engines.ts                        one line of JSON: the engine, and a digest of the results of each function
 *   node tests/lint/math-engines.ts                       the same under V8 (Node strips the types itself)
 *   bun tests/lint/math-engines.ts --dump <dir>           the raw results, one file of 8-byte floats per function, over 200,000 inputs
 *   bun tests/lint/math-engines.ts --compare <a> <b>      how many inputs two dumps disagree on, and by how many ulps at most
 *
 * tests/lint/determinism.test.ts runs the first form under Bun and under Node and requires the same digest for every function that
 * A§5.1 allows. The counts in A§5.1 came from the other two: a dump under Node 22.22.2 (V8) and one under Bun 1.3.14
 * (JavaScriptCore), compared [measured 2026-11-04]. It is a script, not a test: bun test only collects *.test.ts.
 *
 * The inputs come from an integer generator and from exact arithmetic, and the powers of ten from literals, which every engine parses
 * alike (`10 ** k` would be one of the things under test), so every engine draws the same ones.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const POW10 = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6]

/** `count` inputs: half uniform in [-20, 20), half spread over twelve orders of magnitude with a random sign. */
function inputsOf(count: number): number[] {
  let state = 123456789
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const inputs: number[] = []
  for (let i = 0; i < count / 2; i++) inputs.push(next() * 40 - 20)
  for (let i = 0; i < count / 2; i++) {
    const scale = POW10[Math.trunc(next() * POW10.length)]
    inputs.push((next() < 0.5 ? -1 : 1) * scale * (1 + next() * 9))
  }
  return inputs
}

type Fn = (...values: number[]) => number
/**
 * What is measured: every function of the Math object, and the operator `**`, which is Number::exponentiate, implementation-
 * approximated like Math.pow. `sumPrecise` takes an iterable and `random` no input, so both are left out.
 */
const measured: Record<string, Fn> = Object.fromEntries(
  Object.getOwnPropertyNames(Math)
    .filter((name) => typeof (Math as unknown as Record<string, unknown>)[name] === 'function' && name !== 'sumPrecise' && name !== 'random')
    .map((name) => [name, (Math as unknown as Record<string, Fn>)[name]]),
)
measured.exponentiation = (x, y) => x ** y
/** The ones that take two numbers; the rest take one. */
const BINARY = ['atan2', 'exponentiation', 'hypot', 'imul', 'max', 'min', 'pow']
const functions = Object.keys(measured)

/** The results of one function over the inputs. A binary function pairs each input with another, a fixed distance along. */
function resultsOf(name: string, inputs: readonly number[]): Float64Array {
  const fn = measured[name]
  const results = new Float64Array(inputs.length)
  if (BINARY.includes(name)) inputs.forEach((x, i) => (results[i] = fn(x, inputs[(i * 7 + 3) % inputs.length])))
  else inputs.forEach((x, i) => (results[i] = fn(x)))
  return results
}

const bits = new BigUint64Array(1)
const asFloat = new Float64Array(bits.buffer)

/** A 64-bit FNV-style digest of the bit patterns, with every NaN as one pattern. */
function digest(results: Float64Array): string {
  let hash = 0xcbf29ce484222325n
  for (const value of results) {
    asFloat[0] = Number.isNaN(value) ? Number.NaN : value
    hash = ((hash ^ bits[0]) * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

/** How far apart two doubles are, in units in the last place; infinities and NaNs count as agreeing when they are the same. */
function ulps(a: number, b: number): number {
  const key = (value: number) => {
    asFloat[0] = value
    const pattern = bits[0]
    return pattern >> 63n === 0n ? pattern : -(pattern & 0x7fffffffffffffffn)
  }
  if (Number.isNaN(a) && Number.isNaN(b)) return 0
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b ? 0 : Number.POSITIVE_INFINITY
  return Number(key(a) > key(b) ? key(a) - key(b) : key(b) - key(a))
}

const readDump = (file: string) => new Float64Array(readFileSync(file).buffer.slice(0))

const [mode, first, second] = process.argv.slice(2)
if (mode === '--dump' && first) {
  mkdirSync(first, { recursive: true })
  const inputs = inputsOf(200_000)
  for (const name of functions) writeFileSync(`${first}/${name}.bin`, new Uint8Array(resultsOf(name, inputs).buffer))
  console.log(`${functions.length} functions over ${inputs.length} inputs written to ${first}`)
} else if (mode === '--compare' && first && second) {
  for (const file of readdirSync(first).sort()) {
    const a = readDump(`${first}/${file}`)
    const b = readDump(`${second}/${file}`)
    let differ = 0
    let most = 0
    for (let i = 0; i < a.length; i++) {
      const distance = ulps(a[i], b[i])
      if (distance > 0) differ++
      most = Math.max(most, distance)
    }
    console.log(`${file.replace(/\.bin$/, '').padEnd(8)} ${String(differ).padStart(6)} of ${a.length} differ, by at most ${most} ulp`)
  }
} else if (mode === undefined) {
  const inputs = inputsOf(20_000)
  const digests = Object.fromEntries(functions.map((name) => [name, digest(resultsOf(name, inputs))]))
  console.log(JSON.stringify({ engine: process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`, inputs: inputs.length, digests }))
} else {
  console.error('usage: math-engines.ts [--dump <dir> | --compare <dir> <dir>]')
  process.exitCode = 2
}
