/**
 * Exact fractions for The Tasting (`verifier`, GAMES.md §10, "Simulation API"): an integer numerator over a positive integer
 * denominator, kept in lowest terms, in bigints, so that a total-variation distance of 0 is a fact about integers and not about
 * rounding. BigInt lives in the exact paths only (GAMES.md §10, "Invariants"): the session's state and view hold plain numbers, and
 * a `Ratio` reaches them as a `Frac`, because a state must have a canonical JSON form and a bigint has none.
 *
 * Everything here is pure, and no function reads a float: `toNumber` is the one way out, for a drawing's height and a decimal
 * beside an exact fraction, and it is never compared.
 */

export interface Ratio {
  readonly num: bigint
  readonly den: bigint
}

/** A fraction as plain numbers, for views and states: reduced, with a positive denominator, and both parts safe integers. */
export interface Frac {
  readonly num: number
  readonly den: number
}

const abs = (x: bigint): bigint => (x < 0n ? -x : x)

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a)
  let y = abs(b)
  while (y !== 0n) {
    const rest = x % y
    x = y
    y = rest
  }
  return x
}

const big = (x: bigint | number): bigint => (typeof x === 'bigint' ? x : BigInt(x))

/** `num` over `den`, reduced. Throws for a zero denominator, and for a number that is not an integer. */
export function ratio(num: bigint | number, den: bigint | number = 1n): Ratio {
  let n = big(num)
  let d = big(den)
  if (d === 0n) throw new RangeError('a fraction has a denominator that is not 0')
  if (d < 0n) {
    n = -n
    d = -d
  }
  const g = gcd(n, d)
  return g <= 1n ? { num: n, den: d } : { num: n / g, den: d / g }
}

export const ZERO: Ratio = { num: 0n, den: 1n }
export const ONE: Ratio = { num: 1n, den: 1n }

export const add = (a: Ratio, b: Ratio): Ratio => ratio(a.num * b.den + b.num * a.den, a.den * b.den)
export const sub = (a: Ratio, b: Ratio): Ratio => ratio(a.num * b.den - b.num * a.den, a.den * b.den)
export const mul = (a: Ratio, b: Ratio): Ratio => ratio(a.num * b.num, a.den * b.den)
export const div = (a: Ratio, b: Ratio): Ratio => ratio(a.num * b.den, a.den * b.num)
export const absolute = (a: Ratio): Ratio => ({ num: abs(a.num), den: a.den })

/** -1, 0 or 1 as `a` is less than, equal to or greater than `b`. */
export function compare(a: Ratio, b: Ratio): -1 | 0 | 1 {
  const left = a.num * b.den
  const right = b.num * a.den
  return left < right ? -1 : left > right ? 1 : 0
}
export const equals = (a: Ratio, b: Ratio): boolean => compare(a, b) === 0
export const isZero = (a: Ratio): boolean => a.num === 0n

export function sum(items: readonly Ratio[]): Ratio {
  let total = ZERO
  for (const item of items) total = add(total, item)
  return total
}

/** `a` times `scale`, rounded to the nearest whole number (halves up): a count of thousandths for a prediction, say. */
export function roundedTimes(a: Ratio, scale: number): number {
  const scaled = a.num * big(scale)
  return Number((2n * scaled + a.den) / (2n * a.den))
}

/** The nearest double, for a drawing's height or a decimal beside an exact fraction. Never compare two of these for equality. */
export const toNumber = (a: Ratio): number => Number(a.num) / Number(a.den)

/** The fraction as plain numbers. Throws if a part is beyond 2^53, which no world of this game reaches. */
export function toFrac(a: Ratio): Frac {
  const num = Number(a.num)
  const den = Number(a.den)
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den)) throw new RangeError('the fraction is too large to print exactly')
  return { num, den }
}

/** A plain fraction as an exact one. */
export const fromFrac = (f: Frac): Ratio => ratio(f.num, f.den)

/** How a fraction is printed: `0`, `1`, `3/64`. */
export function fracText(f: Frac): string {
  if (f.num === 0) return '0'
  return f.den === 1 ? String(f.num) : `${f.num}/${f.den}`
}

/** True when the fraction is exactly 0. */
export const fracIsZero = (f: Frac): boolean => f.num === 0
