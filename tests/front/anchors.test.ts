/*
 * The front page hangs its order ticket on the 3D pass by numbers (src/front/anchors.ts): for a perspective shot with a fixed vertical
 * field of view, a point's height is a fixed fraction of the box and its distance from the centre line a fixed multiple of the box's
 * height, and a lens shifted in its mount only adds a fixed multiple of the height to both. These tests hold that arithmetic to three's
 * own camera with the same shifted lens, at several shapes of the box; the numbers the first paint carries to the computation over
 * the kitchen's plan; the numbers to the scene (the rail across the top third, the clips in order, the line right of the order
 * ticket); and the page's layout to them, with the printer's column at the left and the order ticket short of the line's first
 * station.
 *
 * They also hold the 2D drawing's placement that front.css gives it to the scene's own picture: the drawing is the same shot's
 * picture (packages/play/loop/layout.ts), so where the page puts its frame is where the scene puts every point.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PerspectiveCamera, Vector3 } from 'three'
import { clipX, LINE, lineOf, RAIL, SHOTS, TICKET, viewOf } from '@es/play/loop/kitchen'
import { FRAMES, frameSvg, layoutFrame } from '@es/play/loop/layout'
import type { SvgNode } from '@es/play/loop/svg'
import { framingFor, WIDE_WIDTH, type Vec3 } from '@/scene/camera-rig'
import { FRONT_PRESETS } from '@/games/loop/scene-presets'
import { anchorProperties, fromTop, PASS_ANCHORS, passAnchors, projector } from '@/front/anchors'
import { posterView } from '@/front/poster'

const [preset] = FRONT_PRESETS

/** Where three puts a point in a box `width` × `height`, in CSS px from its top left, through the framing the rig gives that width. */
function threeProjects(point: Vec3, width: number, height: number): { x: number; y: number } {
  const framing = framingFor(preset, width)
  const camera = new PerspectiveCamera(framing.fov, width / height, 0.05, 200)
  camera.position.set(...framing.position)
  camera.up.set(0, 1, 0)
  camera.lookAt(...framing.target)
  // The rig's shifted lens (CameraRig.tsx).
  camera.setViewOffset(width, height, (-framing.shift[0] * height) / 2, (-framing.shift[1] * height) / 2, width, height)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const v = new Vector3(...point).project(camera)
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }
}

/** Where anchors.ts puts it, by the CSS it hands front.css: x = 50cqw + c × 50cqh, y = (1 − d) × 50cqh. */
function anchorsProject(point: Vec3, width: number, height: number): { x: number; y: number } {
  const { c, d } = projector(preset, width)(point)
  return { x: width / 2 + (c * height) / 2, y: fromTop(d) * height }
}

/** Boxes of the pass from 80rem up, where the page stands its objects on the scene (front.css): 1440 × 900, 1280 × 800, 1366 × 768 and so on. */
const BOXES: readonly (readonly [number, number])[] = [
  [1440, 716],
  [1440, 684],
  [1280, 616],
  [1280, 584],
  [1366, 552],
  [1920, 896],
  [1536, 680],
  [2560, 960],
  [1280, 512],
]

describe("the projection is three's, with the lens shifted", () => {
  const points: Vec3[] = [
    [clipX(0, 4), RAIL.y, RAIL.z],
    [clipX(3, 4), RAIL.y - 0.4, RAIL.z + 0.1],
    [-1.7, 2.4, 1.0],
    [0.4, 0.1, -6],
    [1.9, 0.1, 0.2],
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

  test("the kitchen's own projection (the 2D drawing's) is three's too, before its shift", () => {
    const see = viewOf(SHOTS.front.base)
    for (const point of points) {
      const seen = see(point)
      const ours = projector(preset, 1024)(point)
      expect(Math.abs(seen.c - ours.c)).toBeLessThan(1e-4)
      expect(Math.abs(seen.d - ours.d)).toBeLessThan(1e-4)
    }
  })
})

describe('the anchors fit the scene', () => {
  const anchors = passAnchors()

  test('the first paint carries the computed numbers, written out (run passAnchors() and copy them into PASS_ANCHORS)', () => {
    expect(PASS_ANCHORS).toEqual(anchors)
  })

  test("the rail runs across the top third, its clips left to right from the first ticket's left edge, and the line begins left of the rail", () => {
    expect(anchors.railY).toBeGreaterThan(0.08)
    expect(anchors.railY).toBeLessThan(1 / 3)
    expect(anchors.railH).toBeGreaterThan(0)
    expect(anchors.clips).toHaveLength(posterView().slots)
    expect(anchors.clips[0]).toBeGreaterThan(anchors.clipLeft)
    for (let i = 1; i < anchors.clips.length; i++) expect(anchors.clips[i]).toBeGreaterThan(anchors.clips[i - 1])
    expect(anchors.railLeft).toBeLessThan(anchors.clipLeft)
    expect(anchors.lineLeft).toBeLessThan(anchors.railLeft)
    expect(anchors.shift).toBe(framingFor(preset, WIDE_WIDTH).shift[0])
  })

  test("at every shape of the box, the printer's column stands at the left, the order beside it stops short of the line's first station, and the scene keeps the whole line", () => {
    // front.css: the printer's column takes the gutter and 21rem; the order hangs beside it, short of the line's first station, within
    // 18rem and 30rem.
    const rem = 16
    const clamp = (low: number, value: number, high: number) => Math.min(Math.max(low, value), high)
    const line = lineOf(4)
    for (const [width, height] of BOXES) {
      const x = (c: number) => width / 2 + (c * height) / 2
      const gutter = clamp(rem, 0.032 * width, 2.75 * rem)
      const column = 21 * rem
      const orderLeft = gutter + column + 1.25 * rem
      const orderW = clamp(18 * rem, x(anchors.lineLeft) - 1.25 * rem - orderLeft, 30 * rem)
      expect(orderLeft).toBeGreaterThan(gutter + column)
      expect(orderLeft + orderW).toBeLessThan(x(anchors.lineLeft))
      // Every station and every clip is in the box: the last station's far corner is inside the pass, as is the last clip's ticket.
      const lastStation = anchorsProject([line.x(line.count - 1) + line.width / 2, LINE.height + 0.06, LINE.z + LINE.depth / 2], width, height)
      expect(lastStation.x).toBeLessThan(width)
      const lastTicket = anchorsProject([clipX(3, 4) + TICKET.width / 2, RAIL.y, RAIL.z], width, height)
      expect(lastTicket.x).toBeLessThan(width)
    }
  })

  test('front.css gets them as plain numbers, one custom property each', () => {
    const properties = anchorProperties(anchors)
    expect(Object.keys(properties).sort()).toEqual(['--pass-clip-left', '--pass-line-left', '--pass-rail-h', '--pass-rail-left', '--pass-rail-y', '--pass-shift'])
    for (const value of Object.values(properties)) expect(value).toMatch(/^-?\d+(?:\.\d+)?$/)
  })
})

describe("the 2D drawing stands where the scene's picture stands", () => {
  const css = readFileSync(path.resolve(import.meta.dirname, '../../src/front/front.css'), 'utf8')
  const svg = (orientation: 'landscape' | 'portrait') => frameSvg(layoutFrame(posterView(), { orientation, shot: 'front' }))

  test("a frame is the shot's full height, 2.4 heights wide in landscape and 1 in portrait, its centre the camera's", () => {
    expect(FRAMES.landscape.width / (FRAMES.landscape.height / 2)).toBeCloseTo(4.8)
    expect(FRAMES.portrait.width / (FRAMES.portrait.height / 2)).toBeCloseTo(2)
    for (const orientation of ['landscape', 'portrait'] as const) expect(svg(orientation).attrs.viewBox).toBe(`0 0 ${FRAMES[orientation].width} ${FRAMES[orientation].height}`)
  })

  test('front.css sizes the landscape frame 240cqh wide and full height, centred under the stack and shifted by the lens from 80rem', () => {
    expect(css).toContain('left: calc(50cqw - 120cqh);')
    expect(css).toContain('width: 240cqh;')
    expect(css).toContain('height: 100cqh;')
    expect(css).toContain('left: calc(50cqw + (var(--pass-shift) - 2.4) * 50cqh);')
  })

  test("front.css places the phone's frame as the phone's shot shifts its lens: as wide as the box is tall, half a box height down", () => {
    const [, down] = SHOTS.front.portrait.shift
    expect(down).toBe(0.5)
    expect(css).toContain(`top: ${down * 50}cqh;`)
    expect(css).toContain('left: calc(50cqw - 50cqh);')
    expect(css).toContain('width: 100cqh;')
  })

  test("the drawing's clips are the scene's clips: each clip's mark is centred where the shot puts the clip", () => {
    const layers = svg('landscape').children as SvgNode[]
    const clips = ((layers.find((node) => node.attrs['data-part'] === 'clips')?.children ?? []) as SvgNode[]).map((rect) => Number(rect.attrs.x) + Number(rect.attrs.width) / 2)
    const see = viewOf(SHOTS.front.base)
    const half = FRAMES.landscape.height / 2
    expect(clips).toHaveLength(4)
    clips.forEach((centre, slot) => expect(Math.abs(centre - (FRAMES.landscape.width / 2 + see([clipX(slot, 4), RAIL.y, RAIL.z]).c * half))).toBeLessThan(0.6))
  })
})
