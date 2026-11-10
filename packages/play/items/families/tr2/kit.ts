/**
 * What the six TR2 families of W1b-T04 share: the tolerances and the draws that TR6's families already use (`../tr6/kit`, W1-T30), and
 * the few helpers that print a number with the tag it deserves. Each family keeps its own world, its own words and its own band in its
 * own file; this holds what would otherwise be written six times.
 *
 * Like the rest of packages/play it is pure (D-017): no DOM, no clock, no entropy, and no `Math.pow`, `**` or other function whose last
 * bit differs between engines.
 */
import { num } from '../../rich'
import type { ItemTag, NumPart } from '../../types'

export { ARITHMETIC, EXACT, drawOutcome, oneOf, shown, workedPart } from '../tr6/kit'

/** A unit of `''` is no unit: the number is printed alone, as a share or a count of nothing in particular is. */
const tagged = (tag: ItemTag, value: number, unit: string, digits?: number): NumPart => num(value, { ...(unit === '' ? {} : { unit }), tag, ...(digits === undefined ? {} : { digits }) })

/** A number of the scenario: the course's own world, invented for the question. */
export const given = (value: number, unit: string, digits?: number): NumPart => tagged('synthetic', value, unit, digits)

/** A number worked out from the scenario's. */
export const derived = (value: number, unit: string, digits?: number): NumPart => tagged('derived', value, unit, digits)

/** A number read from the pinned source (vLLM v0.33.0 or SGLang v0.5.23): a claim of content/claims holds it, with its quote and the day it was read. */
export const measured = (value: number, unit: string, digits?: number): NumPart => tagged('measured', value, unit, digits)

/** A number of the model's presets, which are the model's own orders of magnitude and are fitted to no trace. */
export const estimated = (value: number, unit: string, digits?: number): NumPart => tagged('estimated', value, unit, digits)

/** A count with its noun, `1 request` or `12 requests`, so that a ticket never reads "1 requests". */
export const counted = (value: number, one: string, many: string, tag: ItemTag = 'synthetic'): NumPart => num(value, { unit: value === 1 ? one : many, tag })
