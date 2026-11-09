/*
 * Paper's shapes (scene kit v1): a ticket off the printer, with its thickness and the slight curl the roll leaves in it, hanging from
 * the middle of its top edge; and the path the printer's paper takes out of its mouth, curling tighter as it hangs. Pure three.
 */
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three'
import { merged, type Vec3 } from './shape'
import { PRINTER, RAIL } from './specs'
import { PRINT_CELLS } from './surfaces'

/** The ball under the rail's slot that grips a ticket, from the rail's top. */
export const CLIP_DROP = RAIL.height + 0.0035

/** Where the printer's paper leaves its mouth, from the printer's base centre (build.ts's printer): just behind its tear bar. */
export const PRINTER_MOUTH: Vec3 = [0, PRINTER.height * 0.72 + 0.014, PRINTER.depth * 0.4]

/** Where a ticket just torn off the printer at `at` (turned `yaw`) starts its way to the rail: hanging from the mouth, tipped forward. */
export function tearPose(at: Vec3, yaw = 0): { at: Vec3; rotation: Vec3 } {
  const p = new Vector3(...PRINTER_MOUTH).applyMatrix4(new Matrix4().makeRotationY(yaw).setPosition(...at))
  return { at: [p.x, p.y, p.z], rotation: [-0.5, yaw, 0] }
}

/** Where a cell of the print atlas starts in UV (the canvas's top row is the texture's top), for the ticket material's `aCell`. */
export function cellOffset(cell: number): readonly [number, number] {
  const n = PRINT_CELLS.across * PRINT_CELLS.down
  const index = ((Math.round(cell) % n) + n) % n
  const column = index % PRINT_CELLS.across
  const row = Math.floor(index / PRINT_CELLS.across)
  return [column / PRINT_CELLS.across, 1 - (row + 1) / PRINT_CELLS.down]
}

/** A strip of quads between two rows of points, with a UV for each point, as one geometry. */
function band(a: readonly Vec3[], b: readonly Vec3[], uvA: readonly (readonly [number, number])[], uvB: readonly (readonly [number, number])[]): BufferGeometry {
  const position = new Float32Array((a.length + b.length) * 3)
  const uv = new Float32Array((a.length + b.length) * 2)
  a.forEach((p, i) => {
    position.set(p, i * 3)
    uv.set(uvA[i], i * 2)
  })
  b.forEach((p, i) => {
    position.set(p, (a.length + i) * 3)
    uv.set(uvB[i], (a.length + i) * 2)
  })
  const index: number[] = []
  for (let i = 0; i < a.length - 1; i++) {
    const p = i
    const q = a.length + i
    index.push(p, p + 1, q, p + 1, q + 1, q)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** Paper's blank: where the back and the edges sample the atlas, in a cell's margin. */
const BLANK: readonly [number, number] = [0.04, 0.03]

/**
 * A ticket `width` × `height` and `thickness` thick, hanging from the middle of its top edge down -y, its face toward +z and its
 * foot curled toward the face by `curl` of its height. The face's UVs cover its atlas cell; its back and edges are blank paper.
 */
export function ticketGeometry(width: number, height: number, thickness: number, curl = 0.22): BufferGeometry {
  const rows = 12
  const columns = 6
  const at = (i: number, j: number, back: boolean): Vec3 => {
    const t = j / rows
    const x = -width / 2 + (width * i) / columns
    // The roll's set: the foot curls forward, and the sheet cups across, its corners a little further forward than its middle.
    const cup = (Math.abs(x) / (width / 2)) ** 2 * curl * height * 0.625 * t
    const z = curl * height * t * t + cup
    return [x, -height * t, back ? z - thickness : z]
  }
  const front: BufferGeometry[] = []
  const back: BufferGeometry[] = []
  for (let i = 0; i < columns; i++) {
    const left: Vec3[] = []
    const right: Vec3[] = []
    const uvL: [number, number][] = []
    const uvR: [number, number][] = []
    const backL: Vec3[] = []
    const backR: Vec3[] = []
    for (let j = 0; j <= rows; j++) {
      left.push(at(i, j, false))
      right.push(at(i + 1, j, false))
      uvL.push([i / columns, 1 - j / rows])
      uvR.push([(i + 1) / columns, 1 - j / rows])
      backL.push(at(i, j, true))
      backR.push(at(i + 1, j, true))
    }
    front.push(band(left, right, uvL, uvR))
    back.push(band(backR, backL, backR.map(() => BLANK), backL.map(() => BLANK)))
  }
  const edge = (points: Vec3[], backPoints: Vec3[]) => band(backPoints, points, backPoints.map(() => BLANK), points.map(() => BLANK))
  const leftEdge = Array.from({ length: rows + 1 }, (_, j) => at(0, j, false))
  const rightEdge = Array.from({ length: rows + 1 }, (_, j) => at(columns, j, false))
  const foot = Array.from({ length: columns + 1 }, (_, i) => at(i, rows, false))
  const head = Array.from({ length: columns + 1 }, (_, i) => at(i, 0, false))
  const edges = [
    edge(leftEdge, leftEdge.map(([x, y, z]) => [x, y, z - thickness] as const)),
    edge(
      rightEdge.map(([x, y, z]) => [x, y, z - thickness] as const),
      rightEdge,
    ),
    edge(foot, foot.map(([x, y, z]) => [x, y, z - thickness] as const)),
    edge(
      head.map(([x, y, z]) => [x, y, z - thickness] as const),
      head,
    ),
  ]
  const sheet = merged([...front, ...back, ...edges]) as BufferGeometry
  for (const part of [...front, ...back, ...edges]) part.dispose()
  return sheet
}

/**
 * The printer's paper out of its mouth, `length` along its curve: forward over the tear bar, then down, curling tighter as it hangs,
 * the way paper off a roll keeps the roll's set [estimated]. Points from the mouth outward in the printer's own (y, z), every
 * `step` metres along the paper.
 */
export function feedPath(length: number, step = 0.006): Vec3[] {
  const points: Vec3[] = [[0, 0, 0]]
  let y = 0
  let z = 0
  let s = 0
  while (s < length) {
    const ds = Math.min(step, length - s)
    const mid = s + ds / 2
    const phi = 0.35 + 7.5 * mid + 30 * mid * mid
    y -= Math.sin(phi) * ds
    z += Math.cos(phi) * ds
    s += ds
    points.push([0, y, z])
  }
  return points
}
