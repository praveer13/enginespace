/*
 * The room's surfaces and the tickets' print, generated in code (scene kit v1), so no image ships and nothing is fetched (D-033):
 *
 *   tile    the back wall's subway tile, 150 × 75 mm in running bond with 3 mm of grout [estimated]: each tile a glazed body with
 *           rounded edges standing proud of the grout, as height, normals, roughness (glaze against grout) and the grout's colour.
 *   floor   the sealed floor's square quarry tiles, 300 mm with 5 mm of grout [estimated], faintly mottled under the seal.
 *   print   the tickets' print: one atlas of order lines in the impact printer's dots, eight tickets to a sheet, so every ticket
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

export interface PrintInks {
  readonly paper: string
  readonly ink: string
  readonly rule: string
}

/**
 * Draws the atlas on a canvas: paper with its tooth, the soft mottle of its fibres in the rule's ink, and each sheet a shade darker toward
 * its cut edges (where the ticket's back and edges sample it too, so its thickness reads); then each cell's print as an impact printer
 * leaves it, in dots: lines of words a few dots long, the dots round and large enough to read as dots at the size a scene draws a ticket,
 * and the dotted rules between them in the rule's ink. It prints no letter and no number, so it is the paper's texture and never a readout
 * (GAMES.md §2.6, rule 7), and it is drawn at once, with no face to wait for. The mottle's and the edges' strengths are [estimated].
 */
export function drawPrint(canvas: HTMLCanvasElement | OffscreenCanvas, inks: PrintInks): void {
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!context) return
  const { width, height } = PRINT_SIZE
  const cw = width / PRINT_CELLS.across
  const ch = height / PRINT_CELLS.down
  context.fillStyle = inks.paper
  context.fillRect(0, 0, width, height)
  for (let cell = 0; cell < PRINT_CELLS.across * PRINT_CELLS.down; cell++) {
    const x0 = (cell % PRINT_CELLS.across) * cw
    const y0 = Math.floor(cell / PRINT_CELLS.across) * ch
    // The tooth: a soft mottle of fibres inside the sheet, then the sheet a shade darker toward its cut edges.
    context.fillStyle = context.strokeStyle = inks.rule
    for (let k = 0; k < 110; k++) {
      const r = 2 + 9 * hash(k, cell, 7)
      context.globalAlpha = 0.04 + 0.06 * hash(k, cell, 8)
      context.beginPath()
      context.arc(x0 + r + 0.5 + (cw - 2 * r - 1) * hash(k, cell, 9), y0 + r + 0.5 + (ch - 2 * r - 1) * hash(k, cell, 10), r, 0, 7)
      context.fill()
    }
    for (const [line, alpha] of [[16, 0.12], [5, 0.3]]) {
      context.globalAlpha = alpha
      context.lineWidth = line
      context.strokeRect(x0 + line / 2, y0 + line / 2, cw - line, ch - line)
    }
    context.globalAlpha = 1
    const cx = x0 + cw * 0.2
    const cy = y0 + ch * 0.17
    // Nine lines a cell; the second and every fourth after it a dotted rule. A line's words end at a space, a dot left out.
    for (let line = 0; line < 9; line++) {
      const rule = line % 4 === 1
      context.fillStyle = rule ? inks.rule : inks.ink
      for (let k = 0, n = rule ? 15 : 3 + ((cell * 5 + line * 3) % 4); k < n; k++) {
        if (rule || (cell + line + k * 2) % 5 < 4) {
          context.beginPath()
          context.arc(cx + k * (rule ? 5 : 15), cy + line * ch * 0.085, rule ? 1.6 : 4.5, 0, 7)
          context.fill()
        }
      }
    }
  }
}
