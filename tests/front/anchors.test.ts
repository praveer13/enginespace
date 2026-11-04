/*
 * The front page hangs its order ticket on the 3D pass by numbers (src/front/anchors.ts): for a perspective shot with a fixed vertical
 * field of view, a point's height is a fixed fraction of the box and its distance from the centre line a fixed multiple of the box's
 * height. These tests hold that arithmetic to three's own camera, at several shapes of the box, and the numbers to the scene: the rail
 * between the printer and the first clip, the strip under the printer, the clips in order; and the page's layout to them, with the
 * scene moved right to leave the printer's column clear.
 *
 * They also hold the 2D drawing's measures that front.css lines the rail up with (poster.ts) to the layout that draws them.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Euler, PerspectiveCamera, Vector3 } from 'three'
import { frameSvg, layoutFrame } from '@es/play/loop/layout'
import type { SvgNode } from '@es/play/loop/svg'
import type { Vec3 } from '@/scene/camera-rig'
import { DEFAULT_PRESET, LOOP_PRESETS } from '@/games/loop/scene-presets'
import { clipX, RAIL, stripSheets, TICKET } from '@/games/loop/scene-layout'
import { anchorProperties, fromTop, passAnchors, projector, sheetCorners } from '@/front/anchors'
import { LANDSCAPE_FRAME, posterView } from '@/front/poster'

const preset = LOOP_PRESETS.find((candidate) => candidate.id === DEFAULT_PRESET) ?? LOOP_PRESETS[0]

/** Where three puts a point in a box `width` × `height`, in CSS px from its top left. */
function threeProjects(point: Vec3, width: number, height: number): { x: number; y: number } {
  const camera = new PerspectiveCamera(preset.fov, width / height, 0.05, 200)
  camera.position.set(...preset.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(...preset.target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const v = new Vector3(...point).project(camera)
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }
}

/** Where anchors.ts puts it, by the CSS it hands front.css: x = 50cqw + c × 50cqh, y = (1 − d) × 50cqh. */
function anchorsProject(point: Vec3, width: number, height: number): { x: number; y: number } {
  const { c, d } = projector(preset)(point)
  return { x: width / 2 + (c * height) / 2, y: fromTop(d) * height }
}

/** Boxes of the pass from 80rem up, where the page stands its objects on the scene (front.css): 1440 × 900, 1280 × 800, 1366 × 768 and so on. */
const BOXES: readonly (readonly [number, number])[] = [
  [1440, 716],
  [1280, 616],
  [1366, 584],
  [1920, 896],
  [1536, 680],
  [2560, 960],
]

describe('the projection is three\'s', () => {
  const points: Vec3[] = [
    [clipX(0), RAIL.y, RAIL.z],
    [clipX(3), RAIL.y - 0.4, RAIL.z + 0.1],
    [-1.7, 2.4, 1.0],
    [0.4, 0.1, -6],
    [1.9, 0.1, 2.2],
  ]
  for (const [width, height] of BOXES) {
    test(`at ${width} × ${height}, every point lands where three's camera puts it, within a hundredth of a pixel`, () => {
      for (const point of points) {
        const ours = anchorsProject(point, width, height)
        const theirs = threeProjects(point, width, height)
        expect(Math.abs(ours.x - theirs.x)).toBeLessThan(0.01)
        expect(Math.abs(ours.y - theirs.y)).toBeLessThan(0.01)
      }
    })
  }

  test('a sheet\'s corners turn as three turns them (Euler angles, XYZ)', () => {
    for (const sheet of stripSheets(4, [0, 1, 2, 3, 4, 5])) {
      const ours = sheetCorners(sheet)
      const turn = new Euler(...(sheet.rotation ?? [0, 0, 0]))
      const [w, h] = sheet.size
      const theirs = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ].map(([x, y]) => new Vector3(x, y, 0).applyEuler(turn).add(new Vector3(...sheet.center)))
      ours.forEach((corner, i) => {
        expect(corner[0]).toBeCloseTo(theirs[i].x, 9)
        expect(corner[1]).toBeCloseTo(theirs[i].y, 9)
        expect(corner[2]).toBeCloseTo(theirs[i].z, 9)
      })
    }
  })
})

describe('the anchors fit the scene', () => {
  const anchors = passAnchors(posterView())

  test('the rail runs across the top third, under the printer\'s top and over the foot of its strip', () => {
    expect(anchors.railY).toBeGreaterThan(0.08)
    expect(anchors.railY).toBeLessThan(1 / 3)
    expect(anchors.railH).toBeGreaterThan(0)
    expect(anchors.printerTop).toBeLessThan(anchors.railY)
    expect(anchors.stripBottom).toBeGreaterThan(anchors.railY)
    expect(anchors.stripBottom).toBeLessThan(1)
  })

  test('the printer and its strip lie left of the expo\'s tape and of the first clip, and the clips run left to right', () => {
    expect(anchors.coverLeft).toBeLessThan(anchors.coverRight)
    expect(anchors.coverRight).toBeLessThan(anchors.expoLeft)
    expect(anchors.coverRight).toBeLessThan(anchors.clipLeft)
    expect(anchors.clips).toHaveLength(posterView().slots)
    expect(anchors.clips[0]).toBeGreaterThan(anchors.clipLeft)
    for (let i = 1; i < anchors.clips.length; i++) expect(anchors.clips[i]).toBeGreaterThan(anchors.clips[i - 1])
  })

  test('at every shape of the box, the printer\'s column stands at the left, the order beside it stops short of the expo\'s tape, and the scene keeps its last clip', () => {
    // front.css: the 3D pass is drawn on a canvas wider than its box, so the scene's middle moves right by --scene-shift; the printer's
    // column takes the gutter and 15rem; the order hangs beside it, short of the expo's tape, within 18rem and 30rem.
    const rem = 16
    const clamp = (low: number, value: number, high: number) => Math.min(Math.max(low, value), high)
    const ticketHalf = (clipX(1) - clipX(0)) === 0 ? 0 : ((anchors.clips[1] - anchors.clips[0]) / (clipX(1) - clipX(0))) * (TICKET.w / 2)
    for (const [width, height] of BOXES) {
      const shift = clamp(0, 0.15 * width, 13 * rem)
      const x = (c: number) => shift + width / 2 + (c * height) / 2
      const gutter = clamp(rem, 0.032 * width, 2.75 * rem)
      const column = 15 * rem
      const orderLeft = gutter + column + 1.25 * rem
      const orderW = clamp(18 * rem, x(anchors.expoLeft) - rem - orderLeft, 30 * rem)
      expect(orderLeft).toBeGreaterThan(gutter + column)
      expect(orderLeft + orderW).toBeLessThanOrEqual(x(anchors.expoLeft))
      expect(orderLeft + orderW).toBeLessThan(x(anchors.clipLeft))
      // The last clip's ticket is still inside the pass after the shift.
      expect(x(anchors.clips[anchors.clips.length - 1] + ticketHalf)).toBeLessThan(width)
    }
  })

  test('front.css gets them as plain numbers, one custom property each', () => {
    const properties = anchorProperties(anchors)
    expect(Object.keys(properties).sort()).toEqual(
      ['--pass-clip-left', '--pass-cover-left', '--pass-cover-right', '--pass-expo-left', '--pass-printer-top', '--pass-rail-h', '--pass-rail-y', '--pass-strip-bottom'].sort(),
    )
    for (const value of Object.values(properties)) expect(value).toMatch(/^-?\d+(?:\.\d+)?$/)
  })
})

describe('the 2D drawing\'s measures that the rail lines up with', () => {
  const layers = frameSvg(layoutFrame(posterView(), { orientation: 'landscape' })).children as SvgNode[]
  const layer = (part: string) => layers.find((node) => node.attrs['data-part'] === part)

  test('the landscape frame is 720 × 348, its rail\'s bar has its middle 14 down and starts at 372, where the page\'s rail hands over', () => {
    const svg = frameSvg(layoutFrame(posterView(), { orientation: 'landscape' }))
    expect(svg.attrs.viewBox).toBe(`0 0 ${LANDSCAPE_FRAME.width} ${LANDSCAPE_FRAME.height}`)
    const bar = (layer('rail')?.children as SvgNode[])[0]
    expect(Number(bar.attrs.y) + Number(bar.attrs.height) / 2).toBe(LANDSCAPE_FRAME.railMiddle)
    expect(Number(bar.attrs.x)).toBe(LANDSCAPE_FRAME.railStart)
  })

  test('the lamp\'s amber pools on the pass under the rail, as soft light, and nowhere else in the drawing', () => {
    const pool = (layer('lamp')?.children as SvgNode[])[0]
    const pass = (layer('pass')?.children as SvgNode[])[0]
    expect(pool.attrs.fill).toBe('var(--es-lamp)')
    expect(String(pool.attrs.filter)).toMatch(/^url\(#es-lamp-pool-landscape\)$/)
    expect(Number(pool.attrs.y)).toBeGreaterThanOrEqual(Number(pass.attrs.y))
    expect(Number(pool.attrs.y) + Number(pool.attrs.height)).toBeLessThanOrEqual(Number(pass.attrs.y) + Number(pass.attrs.height))
    const lamps = layers.flatMap((node) => (node.children as SvgNode[] | undefined) ?? []).filter((mark) => mark.attrs.fill === 'var(--es-lamp)')
    expect(lamps).toEqual([pool])
  })

  test('front.css uses the same numbers', () => {
    const css = readFileSync(path.resolve(import.meta.dirname, '../../src/front/front.css'), 'utf8')
    expect(css).toContain(`var(--draw-w) * ${LANDSCAPE_FRAME.railMiddle} / ${LANDSCAPE_FRAME.width}`)
    expect(css).toContain(`var(--draw-w) * ${LANDSCAPE_FRAME.railStart} / ${LANDSCAPE_FRAME.width}`)
  })
})
