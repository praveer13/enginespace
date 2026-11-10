/**
 * What rules 1 and 2 hold a bundle to (ARCHITECTURE §8.5, D-029), and how much of a finding the report keeps.
 *
 * The two caps are design parameters [estimated]: 32 MB for the file and 256 MB for what is inside it. A megabyte is 1,048,576 bytes here, as in
 * the grader's writer (labs/grader/src/enginespace_grader/bundle.py, `MAX_COMPRESSED_BYTES`), which refuses to write a bundle that the site
 * would refuse to read, so the two ends hold one number. A lab whose capture is larger lists it with `inBundle: false`, by its hash and size,
 * and the learner keeps the file.
 */

/** The largest file the site reads, in bytes [estimated]. */
export const MAX_COMPRESSED_BYTES = 32 * 1024 * 1024

/** The most that a file may hold once decompressed, in bytes [estimated]. Counted while it is decompressed, so a zip bomb stops there. */
export const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024

export interface Caps {
  readonly compressedBytes: number
  readonly decompressedBytes: number
}

/** The caps of rule 1. A test passes smaller ones, so that a bomb need not be as large as the real one. */
export const CAPS: Caps = { compressedBytes: MAX_COMPRESSED_BYTES, decompressedBytes: MAX_DECOMPRESSED_BYTES }

/**
 * What rule 2 holds the shape of the text to, before it parses it (shape.ts). The caps above bound the bytes, and bytes are not what a parser costs: a file
 * inside the caps can still make `JSON.parse` allocate gigabytes, and a dedicated worker that runs out of memory takes the learner's tab with it. Both are
 * design parameters [estimated], set from the figures in shape.ts's header and checked against the figures of honest bundles in tests/verify/shape.test.ts.
 */
export interface Shape {
  /** The most arrays and objects open at once. A bundle nests about 7 deep. */
  readonly depth: number
  /** The most arrays, objects and strings (the names of members among them) in the whole text. Numbers, `true`, `false` and `null` are not counted. */
  readonly nodes: number
}

/** The deepest that the JSON of a bundle may nest [estimated]. */
export const MAX_DEPTH = 64

/** The most arrays, objects and strings that the JSON of a bundle may hold [estimated]: 4 Mi, 4,194,304. */
export const MAX_NODES = 4 * 1024 * 1024

/** The shape bounds of rule 2. A test passes smaller ones, so that a file that breaks them need not be as large as the real one. */
export const SHAPE: Shape = { depth: MAX_DEPTH, nodes: MAX_NODES }

/**
 * How many problems a rule names before it says "and N more" [estimated]. A receipt comes from a file that someone may have edited, and
 * the first few problems are where to look: a rule that found a thousand would not help the learner, and the page would have to draw them.
 */
export const PROBLEMS_SHOWN = 6

/** The longest a problem is, in characters [estimated]. A name or a message that came out of the file is cut to this before it is quoted. */
export const PROBLEM_CHARS = 280
