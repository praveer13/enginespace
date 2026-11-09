// The vocabulary every model shares (ARCHITECTURE §5.2, `core`): integer time, seeds, ids and the four tags.
//
// Nothing here runs. A value of these types is a plain number, so it crosses a worker boundary, a canonical-JSON hash and the
// Python grader (§9.8) unchanged.

/**
 * Time, in integer microseconds. Every value stays below 2^53, so sums and products of times stay exact (§5.1). Traces count
 * nanoseconds instead (§5.7), and `NS_PER_US` converts.
 */
export type Us = number

/** A seed is an unsigned 32-bit integer: the 8 hex digits of a challenge token (§8.4), or `freshSeed()` at grade time. */
export type Seed = number

/** A probability, or a share, as an integer out of 1,000 (§5.1: probabilities are integer weights). */
export type Permille = number

/** A request's id: its index in arrival order, from 0. */
export type ReqId = number

/** A LoRA adapter's id, from 0. */
export type AdapterId = number

/** A prefix-sharing group's id, from 0. Requests of one group share the first tokens of their prompts. */
export type PrefixGroupId = number

/**
 * How a number in code, content or on screen is known (ARCHITECTURE §0, DECISIONS "Tags"):
 * read or measured from a named source, arithmetic on tagged inputs, a judgment or design target, or not yet checked.
 */
export type Tag = 'measured' | 'derived' | 'estimated' | 'unverified'

export const NS_PER_US = 1_000
export const US_PER_MS = 1_000
export const US_PER_S = 1_000_000
