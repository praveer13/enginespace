/**
 * The compare strips of the step loop's debrief (GAMES.md §3.1, beat 4): the GPU lane of one service drawn small, so that three can sit side
 * by side on one scale. Pure: a list of fires in, a tree of SVG out. The strip is drawn flat in the design system's roles and carries no text,
 * because the captions and the counts beside it are DOM.
 */
import type { FireView } from './types'
import { num } from './svg'
import type { SvgNode } from './svg'

/** The roles a strip paints with (src/design/tokens.ts). `none` is no paint. */
type Paint = 'none' | 'surface-3' | 'lane-gpu' | 'paper'

interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly fill: Paint
  readonly rx?: number
  readonly stroke?: Paint
  readonly width?: number
  readonly dash?: string
}

export interface Strip {
  readonly width: number
  readonly height: number
  /** The accessible name of the drawing. */
  readonly label: string
  readonly rects: readonly Rect[]
}

/** The size of a strip, in its own units. A strip is the GPU lane of one service, drawn small so that three can sit side by side. */
export const STRIP = { width: 720, row: 9, gap: 2, pad: 3, margin: 4 } as const

/**
 * The GPU lane of one service as a strip: dark where the GPU sat idle, a lit slab for each step, and a place for every batch slot in it.
 * Every strip of one comparison takes the same `scaleTicks`, so lengths are comparable: a length comparison must not depend on anything
 * but the length.
 */
export function layoutStrip(fires: readonly FireView[], options: { readonly slots: number; readonly scaleTicks: number; readonly label: string }): Strip {
  const { slots, scaleTicks } = options
  const height = STRIP.pad * 2 + slots * STRIP.row + (slots - 1) * STRIP.gap
  const px = (STRIP.width - 2 * STRIP.margin) / Math.max(scaleTicks, 1)
  const rects: Rect[] = [{ x: 0, y: 0, w: STRIP.width, h: height, fill: 'surface-3', rx: 2 }]
  for (const fire of fires) {
    const x = num(STRIP.margin + fire.startUs * px)
    const w = num((fire.endUs - fire.startUs) * px)
    rects.push({ x, y: STRIP.pad - 2, w, h: height - 2 * (STRIP.pad - 2), fill: 'lane-gpu' })
    fire.places.forEach((place, j) => {
      const y = STRIP.pad + j * (STRIP.row + STRIP.gap)
      const at = { x: num(x + 0.75), y, w: num(Math.max(w - 1.5, 0.5)), h: STRIP.row }
      if (place.state === 'plate') rects.push({ ...at, fill: 'paper' })
      else if (place.state === 'binned') rects.push({ ...at, fill: 'none', stroke: 'paper', width: 1, dash: '2 1.5' })
      else rects.push({ ...at, fill: 'surface-3' })
    })
  }
  return { width: STRIP.width, height, label: options.label, rects }
}

const paint = (role: Paint): string => (role === 'none' ? 'none' : `var(--es-${role})`)

/** The SVG of a strip: an image with the strip's label, whose box is its own, so the browser reserves the space before any style loads. */
export function stripSvg(strip: Strip): SvgNode {
  const rects = strip.rects.map(
    (rect): SvgNode => ({
      tag: 'rect',
      attrs: {
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
        ...(rect.rx === undefined ? {} : { rx: rect.rx }),
        fill: paint(rect.fill),
        ...(rect.stroke === undefined ? {} : { stroke: paint(rect.stroke) }),
        ...(rect.width === undefined ? {} : { strokeWidth: num(rect.width) }),
        ...(rect.dash === undefined ? {} : { strokeDasharray: rect.dash }),
      },
    }),
  )
  return {
    tag: 'svg',
    attrs: { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${strip.width} ${strip.height}`, width: strip.width, height: strip.height, role: 'img', 'aria-label': strip.label },
    children: [{ tag: 'g', attrs: { 'data-part': 'strip' }, children: rects }],
  }
}
