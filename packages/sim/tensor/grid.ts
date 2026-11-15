// A Triton-style grid over a tensor (GAMES.md §4, `grid`): one program per BLOCK-sized tile, with masks at the edges.
//
// The program with grid index `p` covers, along dim `d`, the lanes `p[d] * block[d] + 0 … block[d] - 1`, and a lane is masked when its
// coordinate is not below the shape (`mask = offs < n` in a kernel). The default grid is `ceil(shape / block)` on each dim, as
// `triton.cdiv` gives. A learner can give a smaller grid, which leaves the end of the tensor uncovered.
//
// `tl.arange` takes a power of two, so `pow2` says whether every BLOCK is one; a kernel with another BLOCK does not compile, and the model
// still counts the grid, so that the game can show why a size is refused.

export interface GridResult {
  /** Programs launched. */
  readonly programs: number
  /** Lanes launched: programs times the lanes of a block. */
  readonly lanes: number
  /** Lanes whose mask is false. */
  readonly masked: number
  /** Elements some program covers. */
  readonly covered: number
  /** Elements that more than one lane covers: 0 for any grid of this form, since tiles do not overlap. */
  readonly duplicated: number
  /** Every element is covered exactly once. */
  readonly exact: boolean
  readonly pow2: boolean
  /** The grid used: programs per dim. */
  readonly grid: readonly number[]
}

const isPow2 = (n: number) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0

export function cdiv(a: number, b: number): number {
  return Math.ceil(a / b)
}

/** The grid, its lanes and its masks. `grid` defaults to `ceil(shape / block)`. Error: a rank mismatch, or a size or block that is not a positive integer. */
export function gridCoverage(shape: readonly number[], block: readonly number[], grid?: readonly number[]): GridResult | { readonly error: 'bad-shape' } {
  const rank = shape.length
  const positive = (xs: readonly number[]) => xs.every((x) => Number.isInteger(x) && x >= 1)
  if (rank === 0 || block.length !== rank || !positive(block) || !shape.every((x) => Number.isInteger(x) && x >= 0)) return { error: 'bad-shape' }
  if (grid && (grid.length !== rank || !grid.every((x) => Number.isInteger(x) && x >= 1))) return { error: 'bad-shape' }
  const g = grid ? [...grid] : shape.map((n, d) => Math.max(cdiv(n, block[d] ?? 1), 1))
  let programs = 1
  let blockLanes = 1
  let covered = 1
  for (let d = 0; d < rank; d++) {
    programs *= g[d] ?? 1
    blockLanes *= block[d] ?? 1
    covered *= Math.min((g[d] ?? 1) * (block[d] ?? 1), shape[d] ?? 0)
  }
  const lanes = programs * blockLanes
  let total = 1
  for (const n of shape) total *= n
  return { programs, lanes, masked: lanes - covered, covered, duplicated: 0, exact: covered === total, pow2: block.every(isPow2), grid: g }
}

/** The elements that the program at `index` covers, as coordinates in row-major order, with its masked lanes counted. For the grid level's tiles. */
export function programCells(shape: readonly number[], block: readonly number[], index: readonly number[]): { cells: number[][]; masked: number } | { error: 'bad-shape' } {
  const rank = shape.length
  if (rank === 0 || block.length !== rank || index.length !== rank || !block.every((b) => Number.isInteger(b) && b >= 1)) return { error: 'bad-shape' }
  const cells: number[][] = []
  let lanes = 1
  for (const b of block) lanes *= b
  const at = new Array<number>(rank).fill(0)
  for (let k = 0; k < lanes; k++) {
    let rest = k
    for (let d = rank - 1; d >= 0; d--) {
      at[d] = rest % (block[d] ?? 1)
      rest = Math.floor(rest / (block[d] ?? 1))
    }
    const coord = at.map((a, d) => (index[d] ?? 0) * (block[d] ?? 1) + a)
    if (coord.every((c, d) => c < (shape[d] ?? 0))) cells.push(coord)
  }
  return { cells, masked: lanes - cells.length }
}
