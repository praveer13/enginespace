/*
 * One table of snippets for the two layers of the determinism lint: eslint.config.js, which the editor and `npm run lint`
 * run, and scripts/verify-determinism.ts, the gate. tests/lint/eslint-rules.test.ts and tests/lint/determinism.test.ts both
 * run every snippet, so the two layers cannot disagree about a construct without a test failing. This file is a helper, not
 * a test file.
 */
import { BANNED_MATH } from '../../scripts/verify-determinism'

export interface Case {
  name: string
  /** The body of a module under packages/sim or packages/play. */
  code: string
}

/**
 * Math members that A§5.1 does not ban: the arithmetic, rounding and integer helpers that its models use. ECMA-262 specifies each of
 * them exactly (sqrt as the correctly rounded root), so every engine returns the same bits. `f16round` (ES2025) and `sumPrecise`
 * (ES2026) are exact too. Between them and BANNED_MATH they are every function of the Math object, which
 * tests/lint/determinism.test.ts checks against the engine that runs the tests.
 */
export const UNBANNED_MATH = ['abs', 'ceil', 'clz32', 'f16round', 'floor', 'fround', 'imul', 'max', 'min', 'round', 'sign', 'sqrt', 'sumPrecise', 'trunc'] as const

/** What both layers must flag: the bans of ARCHITECTURE §5.1, written the ways code writes them. */
export const BANNED: Case[] = [
  ...BANNED_MATH.map((member) => ({ name: `Math.${member}`, code: `export const f = Math.${member}(1)` })),
  { name: 'Math?.random through an optional chain', code: 'export const f = Math?.random()' },
  { name: "Math['random'] with a string key", code: "export const f = Math['random']()" },
  { name: 'Math[`pow`] with a template key', code: 'export const f = Math[`pow`](2, 3)' },
  { name: 'Math[key] with a computed key', code: "declare const key: 'floor' | 'pow'\nexport const f = Math[key]" },
  { name: 'const { pow } = Math', code: 'const { pow } = Math\nexport const f = pow(2, 3)' },
  { name: 'Date.now()', code: 'export const f = Date.now()' },
  { name: 'new Date(0)', code: 'export const f = new Date(0)' },
  { name: 'Date.UTC(…)', code: 'export const f = Date.UTC(2020, 0, 1)' },
  { name: 'x instanceof Date', code: 'export const f = (x: unknown) => x instanceof Date' },
  { name: 'performance.now()', code: 'export const f = performance.now()' },
  { name: 'crypto.getRandomValues(…)', code: 'export const f = crypto.getRandomValues(new Uint8Array(1))' },
  { name: 'window', code: 'export const f = window.innerWidth' },
  { name: 'document', code: 'export const f = document.title' },
  { name: 'typeof window', code: "export const f = typeof window !== 'undefined'" },
  { name: 'globalThis.Math.random()', code: 'export const f = globalThis.Math.random()' },
  { name: 'the ** operator', code: 'export const f = 2 ** 3' },
  { name: 'the **= operator', code: 'let x = 2\nx **= 3\nexport { x }' },
  { name: '.sort() without a comparator', code: 'export const f = [3, 1].sort()' },
  { name: '?.sort() without a comparator', code: 'export const f = [3, 1]?.sort()' },
  { name: "['sort']() without a comparator", code: "export const f = [3, 1]['sort']()" },
]

/** What neither layer may flag: the allowed side of each ban, so that the bans stay narrow. */
export const ALLOWED: Case[] = [
  ...UNBANNED_MATH.map((member) => ({ name: `Math.${member}`, code: `export const f = Math.${member}(1)` })),
  { name: 'Math.PI', code: 'export const f = Math.PI' },
  { name: 'const { floor, max } = Math', code: 'const { floor, max } = Math\nexport const f = floor(max(1, 2.5))' },
  { name: '.sort with a comparator', code: 'export const f = [3, 1].sort((a, b) => a - b)' },
  { name: 'Date as a type', code: 'export let stamp: Date | undefined' },
  { name: 'a parameter named window', code: 'export const total = (window: number[]) => window.reduce((sum, x) => sum + x, 0)' },
  { name: 'property names that spell a banned global', code: 'const o = { Date: 1, performance: 2 }\nexport const f = o.Date + o.performance' },
  { name: 'comments and strings that mention a ban', code: "// Math.random() and Date.now()\nexport const s = 'new Date(' + `performance.now ${1 + 1}` + ' ** '" },
  { name: 'plain arithmetic', code: 'export const f = (x: number) => (x * x) / 2 + (x % 3) - 1' },
]

/**
 * What only the gate flags: aliases of Math, which a rule that looks at one node cannot follow. eslint.config.js leaves
 * these to scripts/verify-determinism.ts.
 */
export const GATE_ONLY: Case[] = [
  { name: 'an alias, const M = Math', code: 'const M = Math\nexport const f = M.random()' },
  { name: 'a cast, (Math as …).random', code: 'export const f = (Math as unknown as { random(): number }).random()' },
  { name: 'a non-null assertion, Math!.random', code: 'export const f = Math!.random()' },
  { name: 'Math passed as an argument', code: "export const f = Reflect.get(Math, 'random')" },
  { name: 'a destructuring assignment from Math', code: 'let pow: (a: number, b: number) => number\n;({ pow } = Math)\nexport { pow }' },
  { name: 'a destructuring with a rest element', code: 'const { floor, ...rest } = Math\nexport const f = [floor, rest]' },
  { name: '.sort(undefined)', code: 'export const f = [3, 1].sort(undefined)' },
  { name: '.sort(void 0)', code: 'export const f = [3, 1].sort(void 0)' },
]
