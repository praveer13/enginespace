/*
 * The room's surfaces and the tickets' print, generated in code (scene kit v1), so no image ships and nothing is fetched (D-033):
 *
 *   tile    the back wall's subway tile, 150 × 75 mm in running bond with 3 mm of grout [estimated]: each tile a glazed body with
 *           rounded edges standing proud of the grout, as height, normals, roughness (glaze against grout) and the grout's colour.
 *   floor   the sealed floor's square quarry tiles, 300 mm with 5 mm of grout [estimated], faintly mottled under the seal.
 *   print   the tickets' print: one atlas of order lines in the printer's dot-matrix face, eight tickets to a sheet, so every ticket
 *           in a scene shares one texture and picks its cell. The print is texture, generic and the same on every visit; every
 *           number a learner reads stays a DOM label (GAMES.md §2.6, rule 7).
 *
 * The fields are plain arrays, seeded, wrapping at their edges; materials.ts wraps them in textures. Colours come in from the roles.
 */

/** A 2D integer hash in [0, 1): seeded white noise. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise with `cells` across, wrapping. */
function smoothNoise(x: number, y: number, cells: number, seed: number): number {
  const fx = x * cells
  const fy = y * cells
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const at = (i: number, j: number) => hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed)
  const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx
  const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx
  return top * (1 - sy) + bottom * sy
}

export interface SurfaceMaps {
  readonly width: number
  readonly height: number
  /** Tangent-space normals, RGBA. */
  readonly normal: Uint8Array
  /** Roughness in the green channel, RGBA. */
  readonly roughness: Uint8Array
  /** What the role's colour is multiplied by, RGBA, linear: 1 on a tile's body, the grout's own colour over the tile's in the joints. */
  readonly albedo: Uint8Array
}

/** The world size one copy of a surface's maps covers, in metres: the UV scale its material sets. */
export const TILE_MODULE = { width: 0.3, height: 0.15 } as const
export const FLOOR_MODULE = 0.6

/** A height field into RGBA normals: +v up, the OpenGL convention three reads. */
function normalsOf(height: Float32Array, width: number, rows: number, strength: number): Uint8Array {
  const out = new Uint8Array(width * rows * 4)
  const h = (x: number, y: number) => height[(((y % rows) + rows) % rows) * width + (((x % width) + width) % width)]
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const du = (h(x + 1, y) - h(x - 1, y)) * strength
      const dv = (h(x, y + 1) - h(x, y - 1)) * strength
      const length = Math.hypot(du, dv, 1)
      const i = (y * width + x) * 4
      out[i] = Math.round(((-du / length) * 0.5 + 0.5) * 255)
      out[i + 1] = Math.round(((-dv / length) * 0.5 + 0.5) * 255)
      out[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255)
      out[i + 3] = 255
    }
  }
  return out
}

const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)

/**
 * The joints' colour over the body's, per channel, from two role colours as linear [r, g, b]: what the albedo map multiplies the
 * body's role by in a joint, so the grout comes out in its own role.
 */
export type Rgb = readonly [number, number, number]

/** A tile's height across its edge: `d` is the distance into the tile from its joint, in metres; the glaze rounds over `round`. */
function edge(d: number, round: number): number {
  if (d <= 0) return 0
  if (d >= round) return 1
  const t = d / round
  return Math.sqrt(1 - (1 - t) * (1 - t))
}

/** The subway tile's maps, `width` × `width / 2` texels over one module (two tiles across, two rows in running bond). */
export function tileMaps(width: number, grout: Rgb, roughness: { glaze: number; grout: number }): SurfaceMaps {
  const rows = width / 2
  const metre = width / TILE_MODULE.width
  const joint = 0.0015
  const round = 0.004
  const height = new Float32Array(width * rows)
  const rough = new Uint8Array(width * rows * 4)
  const albedo = new Uint8Array(width * rows * 4)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const mx = x / metre
      const my = y / metre
      const row = my < 0.075 ? 0 : 1
      // Running bond: the second row is offset by half a tile.
      const lx = (mx + (row === 1 ? 0.075 : 0)) % 0.15
      const ly = my - row * 0.075
      const d = Math.min(lx - joint, 0.15 - joint - lx, ly - joint, 0.075 - joint - ly)
      const body = edge(d, round)
      // Each tile's glaze is a touch uneven: a slow wave across it, a different one per tile.
      const tileId = Math.floor((mx + (row === 1 ? 0.075 : 0)) / 0.15) * 7 + row * 13
      const wave = (smoothNoise(x / width, y / rows, 3, 41 + tileId) - 0.5) * 0.06
      height[y * width + x] = body * (1 + wave)
      const i = (y * width + x) * 4
      const g = byte(body > 0.02 ? roughness.glaze + (hash(x, y, 5) - 0.5) * 0.04 : roughness.grout)
      rough[i] = g
      rough[i + 1] = g
      rough[i + 2] = g
      rough[i + 3] = 255
      const inJoint = 1 - Math.min(1, body * 1.6)
      const shade = 1 - (hash(tileId, 3, 9) - 0.5) * 0.04
      albedo[i] = byte(shade * (1 - inJoint) + grout[0] * inJoint)
      albedo[i + 1] = byte(shade * (1 - inJoint) + grout[1] * inJoint)
      albedo[i + 2] = byte(shade * (1 - inJoint) + grout[2] * inJoint)
      albedo[i + 3] = 255
    }
  }
  return { width, height: rows, normal: normalsOf(height, width, rows, 2.6), roughness: rough, albedo }
}

/** The floor's maps, `size` texels square over one module of two by two quarry tiles. */
export function floorMaps(size: number, grout: number, roughness: number): SurfaceMaps {
  const metre = size / FLOOR_MODULE
  const tile = FLOOR_MODULE / 2
  const joint = 0.0025
  const height = new Float32Array(size * size)
  const rough = new Uint8Array(size * size * 4)
  const albedo = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lx = (x / metre) % tile
      const ly = (y / metre) % tile
      const d = Math.min(lx - joint, tile - joint - lx, ly - joint, tile - joint - ly)
      const body = edge(d, 0.006)
      const mottle = smoothNoise(x / size, y / size, 8, 17) * 0.6 + smoothNoise(x / size, y / size, 23, 29) * 0.4
      height[y * size + x] = body * (0.96 + mottle * 0.04)
      const i = (y * size + x) * 4
      const g = byte(body > 0.05 ? roughness + (mottle - 0.5) * 0.18 : 0.85)
      rough[i] = g
      rough[i + 1] = g
      rough[i + 2] = g
      rough[i + 3] = 255
      const a = byte((0.9 + mottle * 0.12) * body + grout * (1 - body))
      albedo[i] = a
      albedo[i + 1] = a
      albedo[i + 2] = a
      albedo[i + 3] = 255
    }
  }
  return { width: size, height: size, normal: normalsOf(height, size, size, 1.6), roughness: rough, albedo }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The print                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The atlas: cells across and down, each one ticket's face. */
export const PRINT_CELLS = { across: 4, down: 2 } as const
export const PRINT_SIZE = { width: 512, height: 512 } as const

/**
 * The order lines the atlas prints, one list per cell: kitchen words with no number a learner needs, so the print is the paper's
 * texture and never a readout. A dotted rule is `-`.
 */
const ORDERS: readonly (readonly string[])[] = [
  ['ORDER', '-', 'FIRE', 'COURSE', 'HOLD', '-', 'HEARD'],
  ['TABLE', '-', 'ALL DAY', 'FIRE', 'ON THE FLY', '-', 'SERVICE'],
  ['ORDER', '-', 'SEAT', 'PICK UP', '-', 'HEARD'],
  ['FIRE', '-', 'COURSE', 'COURSE', 'HOLD', 'FIRE', '-', 'EXPO'],
  ['TABLE', '-', 'PICK UP', 'ALL DAY', '-', 'SERVICE'],
  ['ORDER', '-', 'ON THE FLY', 'FIRE', 'SEAT', '-', 'HEARD'],
  ['RUSH', '-', 'FIRE', 'FIRE', 'HOLD', '-', 'EXPO'],
  ['TABLE', '-', 'COURSE', 'PICK UP', 'HEARD', '-', 'SERVICE'],
]

export interface PrintInks {
  readonly paper: string
  readonly ink: string
  readonly rule: string
  /** The printer's face: the ticket role's family, from the roles (never named here). */
  readonly family: string
}

/**
 * Draws the atlas on a canvas: paper, then each cell's order lines in the dot-matrix face, the dotted rules between them, and a torn
 * edge's shadow of dots along the top. `withText` false draws the paper and rules only, for the moment before the face has loaded.
 */
export function drawPrint(canvas: HTMLCanvasElement | OffscreenCanvas, inks: PrintInks, withText: boolean): void {
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!context) return
  const { width, height } = PRINT_SIZE
  const cw = width / PRINT_CELLS.across
  const ch = height / PRINT_CELLS.down
  context.fillStyle = inks.paper
  context.fillRect(0, 0, width, height)
  ORDERS.forEach((lines, cellIndex) => {
    const cx = (cellIndex % PRINT_CELLS.across) * cw
    const cy = Math.floor(cellIndex / PRINT_CELLS.across) * ch
    const margin = cw * 0.11
    // The head is left blank: the ticket's number is a DOM label there (GAMES.md §2.6, rule 7).
    let y = cy + ch * 0.3
    const lineHeight = ch * 0.085
    for (const line of lines) {
      if (line === '-') {
        context.fillStyle = inks.rule
        for (let x = cx + margin; x < cx + cw - margin; x += 5) {
          context.beginPath()
          context.arc(x, y - lineHeight * 0.32, 1.1, 0, Math.PI * 2)
          context.fill()
        }
        y += lineHeight * 0.6
        continue
      }
      if (withText) {
        context.fillStyle = inks.ink
        context.font = `900 ${Math.round(lineHeight * 0.82)}px ${inks.family}`
        context.textBaseline = 'alphabetic'
        context.fillText(line, cx + margin, y, cw - 2 * margin)
      }
      y += lineHeight
    }
  })
}
