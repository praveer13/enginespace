/*
 * The front page hangs its order ticket on the 3D pass by numbers (src/front/anchors.ts): for a perspective shot with a fixed vertical
 * field of view, a point's height is a fixed fraction of the box and its distance from the centre line a fixed multiple of the box's
 * height. These tests hold that arithmetic to three's own camera, at several shapes of the box; the numbers the first paint carries to
 * the computation over the scene's layout; the numbers to the scene (the rail across the top third, the clips in order); and the
 * page's layout to them, with the printer's column at the left and the order ticket short of the first clip.
 *
 * They also hold the 2D drawing's measures that front.css lines the rail up with (poster.ts) to the layout that draws them.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PerspectiveCamera, Vector3 } from 'three'
import { frameSvg, layoutFrame } from '@es/play/loop/layout'
import type { SvgNode } from '@es/play/loop/svg'
import type { Vec3 } from '@/scene/camera-rig'
import { FRONT_PRESETS } from '@/games/loop/scene-presets'
import { clipX, RAIL, TICKET } from '@/games/loop/scene-layout'
import { anchorProperties, fromTop, PASS_ANCHORS, passAnchors, projector } from '@/front/anchors'
import { LANDSCAPE_FRAME, posterView } from '@/front/poster'

const [preset] = FRONT_PRESETS

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
  [1280, 512],
]

describe('the projection is three\'s', () => {
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
})

describe('the anchors fit the scene', () => {
  const anchors = passAnchors()

  test('the first paint carries the computed numbers, written out (run passAnchors() and copy them into PASS_ANCHORS)', () => {
    expect(PASS_ANCHORS).toEqual(anchors)
  })

  test('the rail runs across the top third, and its clips run left to right from the first ticket\'s left edge', () => {
    expect(anchors.railY).toBeGreaterThan(0.08)
    expect(anchors.railY).toBeLessThan(1 / 3)
    expect(anchors.railH).toBeGreaterThan(0)
    expect(anchors.clips).toHaveLength(posterView().slots)
    expect(anchors.clips[0]).toBeGreaterThan(anchors.clipLeft)
    for (let i = 1; i < anchors.clips.length; i++) expect(anchors.clips[i]).toBeGreaterThan(anchors.clips[i - 1])
  })

  test('at every shape of the box, the printer\'s column stands at the left, the order beside it stops short of the first clip, and the scene keeps its last', () => {
    // front.css: the printer's column takes the gutter and 21rem; the order hangs beside it, short of the first clip's ticket, within
    // 18rem and 30rem.
    const rem = 16
    const clamp = (low: number, value: number, high: number) => Math.min(Math.max(low, value), high)
    const ticketHalf = ((anchors.clips[1] - anchors.clips[0]) / (clipX(1, 4) - clipX(0, 4))) * (TICKET.width / 2)
    for (const [width, height] of BOXES) {
      const x = (c: number) => width / 2 + (c * height) / 2
      const gutter = clamp(rem, 0.032 * width, 2.75 * rem)
      const column = 21 * rem
      const orderLeft = gutter + column + 1.25 * rem
      const orderW = clamp(18 * rem, x(anchors.clipLeft) - 1.25 * rem - orderLeft, 30 * rem)
      expect(orderLeft).toBeGreaterThan(gutter + column)
      expect(orderLeft + orderW).toBeLessThan(x(anchors.clipLeft))
      // The last clip's ticket is still inside the pass.
      expect(x(anchors.clips[anchors.clips.length - 1] + ticketHalf)).toBeLessThan(width)
    }
  })

  test('front.css gets them as plain numbers, one custom property each', () => {
    const properties = anchorProperties(anchors)
    expect(Object.keys(properties).sort()).toEqual(['--pass-clip-left', '--pass-rail-h', '--pass-rail-y'])
    for (const value of Object.values(properties)) expect(value).toMatch(/^-?\d+(?:\.\d+)?$/)
  })
})

describe('the 2D drawing\'s measures that the rail lines up with', () => {
  const layers = frameSvg(layoutFrame(posterView(), { orientation: 'landscape' })).children as SvgNode[]
  const layer = (part: string) => layers.find((node) => node.attrs['data-part'] === part)

  test('the landscape frame is 720 × 300, its rail\'s bar has its middle 153.5 down and starts at 214, where the page\'s rail hands over', () => {
    const svg = frameSvg(layoutFrame(posterView(), { orientation: 'landscape' }))
    expect(svg.attrs.viewBox).toBe(`0 0 ${LANDSCAPE_FRAME.width} ${LANDSCAPE_FRAME.height}`)
    const bar = (layer('rail')?.children as SvgNode[])[0]
    expect(Number(bar.attrs.y) + Number(bar.attrs.height) / 2).toBe(LANDSCAPE_FRAME.railMiddle)
    expect(Number(bar.attrs.x)).toBe(LANDSCAPE_FRAME.railStart)
  })

  test('the lamp\'s amber pools on the pass, as soft light, and nowhere else in the drawing', () => {
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
    expect(css).toContain(`* ${LANDSCAPE_FRAME.width} / ${LANDSCAPE_FRAME.railMiddle}`)
    expect(css).toContain(`* ${LANDSCAPE_FRAME.width} / ${LANDSCAPE_FRAME.height - LANDSCAPE_FRAME.railMiddle}`)
  })
})
