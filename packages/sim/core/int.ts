// Exact integer arithmetic on doubles (ARCHITECTURE §5.1, "Integer time").
//
// A JavaScript number holds every integer up to 2^53 exactly, and `%` (C's fmod) is exact for them. So a quotient built as
// (a - a % b) / b divides an exact multiple of b, and IEEE 754 divides that exactly: there is no float rounding to differ
// between engines, as there is when a rounded float quotient is floored afterwards. The Python grader ports each function
// as `//` on ints (§9.8). Arguments outside the domain throw, so a time that overflowed 2^53 stops the run instead of
// drifting.

/** A non-negative safe integer. */
export function isUint(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
}

function domain(a: number, b: number): void {
  if (!isUint(a)) throw new RangeError(`expected a non-negative integer below 2^53, got ${a}`)
  if (!isUint(b) || b === 0) throw new RangeError(`expected a positive integer divisor below 2^53, got ${b}`)
}

/** ⌊a / b⌋ for a ≥ 0 and b ≥ 1. */
export function divFloor(a: number, b: number): number {
  domain(a, b)
  return (a - (a % b)) / b
}

/** ⌈a / b⌉ for a ≥ 0 and b ≥ 1. */
export function divCeil(a: number, b: number): number {
  domain(a, b)
  const r = a % b
  return (a - r) / b + (r === 0 ? 0 : 1)
}

/** a / b rounded to the nearest integer, halves up, for a ≥ 0 and b ≥ 1. */
export function divRound(a: number, b: number): number {
  domain(a, b)
  const r = a % b
  const q = (a - r) / b
  return r >= b - r ? q + 1 : q
}

/** part / whole as an integer out of 1,000, rounded to nearest (halves up). `whole` must be positive. */
export function permille(part: number, whole: number): number {
  return divRound(part * 1000, whole)
}
