/*
 * The painter: one frame of the trace on a Canvas2D context (REDESIGN 2.8, "Data Book"). It draws the flat paper and its graticule, the
 * ruler's ticks, the lanes' rules, the marks' washes, the step boundaries, the spans in the one colour code, the cursor and the marks
 * on the rail. It writes no text: every number and every name is DOM over the canvas (D-021, §2.6 rule 7), and the canvas holds
 * nothing the table beside it does not.
 *
 * A span is a block in its code colour with an edge in the code's edge colour and the code's glyph repeated across it, in the ink
 * that reads on the colour, so that no span is told by its colour alone (WCAG 1.4.1). A note is a dashed outline. The glyphs are one
 * pattern tile per kind, shifted with the window so that they travel with the time as it moves. The cursor is the marker: amber with
 * its dark edge, a 2 px line and a ring round the span it stands on. All of it is drawn from the token roles in the theme.
 */
import type { GlyphShape } from '@/design/code'
import { rowY } from './geometry'
import type { LaneBox, TapeGeometry } from './geometry'
import { correlated, spanEnd, spanStart } from './model'
import type { Cursor, TraceIndex, Win } from './model'
import { SPAN_STYLES } from './model'
import type { SpanStyle } from './model'
import type { Mark } from './marks'
import { WIDE_PX } from './plan'
import type { DrawPlan } from './plan'
import { wash } from './theme'
import type { TapeTheme } from './theme'

const TAU = Math.PI * 2
/** The pitch of the glyphs across a span, in CSS px, and their size. */
const PITCH = 11
const GLYPH_R = 2.7

export type Patterns = Readonly<Record<SpanStyle, CanvasPattern | null>>

const cache = new WeakMap<TapeTheme, Map<number, Patterns>>()

function tile(size: number, dpr: number, draw: (c: CanvasRenderingContext2D, px: number) => void): CanvasPattern | null {
  const px = Math.max(2, Math.round(size * dpr))
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const c = canvas.getContext('2d')
  if (c === null) return null
  draw(c, px)
  return c.createPattern(canvas, 'repeat')
}

/** One of the code's glyphs, drawn at (x, y) and `r` from its centre to its widest point. */
function glyph(c: CanvasRenderingContext2D, shape: GlyphShape, x: number, y: number, r: number, color: string): void {
  c.fillStyle = color
  c.strokeStyle = color
  c.lineWidth = Math.max(1, r * 0.45)
  c.beginPath()
  if (shape === 'circle' || shape === 'ring') c.arc(x, y, r, 0, TAU)
  else if (shape === 'square') c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7)
  else if (shape === 'diamond') {
    c.moveTo(x, y - r * 1.2)
    c.lineTo(x + r * 1.2, y)
    c.lineTo(x, y + r * 1.2)
    c.lineTo(x - r * 1.2, y)
    c.closePath()
  } else if (shape === 'triangle') {
    c.moveTo(x, y - r * 1.1)
    c.lineTo(x + r * 1.1, y + r * 0.85)
    c.lineTo(x - r * 1.1, y + r * 0.85)
    c.closePath()
  } else {
    for (let i = 0; i < 6; i++) {
      const angle = (TAU * i) / 6
      if (i === 0) c.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle))
      else c.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle))
    }
    c.closePath()
  }
  if (shape === 'ring') c.stroke()
  else c.fill()
}

/** The glyph tiles of a theme at a pixel ratio, one per kind of span, made once. */
export function patternsFor(theme: TapeTheme, dpr: number): Patterns {
  let byRatio = cache.get(theme)
  if (byRatio === undefined) {
    byRatio = new Map()
    cache.set(theme, byRatio)
  }
  const known = byRatio.get(dpr)
  if (known !== undefined) return known
  const made = Object.fromEntries(
    SPAN_STYLES.map((style) => {
      const ink = theme.styles[style]
      // A note is hollow: its ring is in the neutral edge. Every other kind's glyph is in the ink that reads on its colour.
      const color = style === 'note' ? theme.edge : ink.ink
      return [
        style,
        tile(PITCH, dpr, (c, px) => {
          c.scale(px / PITCH, px / PITCH)
          glyph(c, ink.glyph, PITCH / 2, PITCH / 2, GLYPH_R, color)
        }),
      ]
    }),
  ) as Record<SpanStyle, CanvasPattern | null>
  byRatio.set(dpr, made)
  return made
}

export interface PaintInput {
  readonly ctx: CanvasRenderingContext2D
  readonly dpr: number
  readonly g: TapeGeometry
  readonly theme: TapeTheme
  readonly patterns: Patterns
  readonly index: TraceIndex
  readonly win: Win
  readonly plan: DrawPlan
  readonly cursor: Cursor | null
  /** The ns a mark being made started at, or null. */
  readonly pendingNs: number | null
  readonly marks: readonly Mark[]
  readonly active: number | null
  readonly cause: number | null
  /** Whether the ruler has numbers and the marks a rail. */
  readonly rail: boolean
}

/** The x of a time, unclamped. */
const xOf = (g: TapeGeometry, win: Win, ns: number): number => g.plotX + ((ns - win.fromNs) * g.plotW) / (win.toNs - win.fromNs)

function rule(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number): void {
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x1, y)
  ctx.stroke()
}

/** Short vertical ticks from `y` for `length` px (up when negative), one per x: the axis's graduations. */
function ticks(ctx: CanvasRenderingContext2D, xs: readonly number[], y: number, length: number): void {
  ctx.beginPath()
  for (const x of xs) {
    const at = Math.round(x) + 0.5
    ctx.moveTo(at, y)
    ctx.lineTo(at, y + length)
  }
  ctx.stroke()
}

/** The ticks of the ruler, major and minor. */
export interface RulerHoles {
  readonly minor: readonly number[]
  readonly major: readonly number[]
}

export function paintTape(input: PaintInput, holesOf: RulerHoles): void {
  const { ctx, dpr, g, theme, patterns, index, win, plan } = input
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, g.width, g.height)

  // The paper, flat, and the label column beside it.
  const paperX = g.gutter
  ctx.fillStyle = theme.paper
  ctx.fillRect(paperX, 0, g.width - paperX, g.height)
  if (g.gutter > 0) {
    ctx.fillStyle = theme.gutter
    ctx.fillRect(0, 0, paperX, g.height)
    ctx.fillStyle = theme.edge
    ctx.fillRect(paperX, 0, 1, g.height)
  }

  // The graticule: a faint rule down the lanes at each major tick, where the time axis is read.
  ctx.strokeStyle = theme.paperRule
  ctx.lineWidth = 1
  const lanesStart = g.lanes.length > 0 ? g.lanes[0].y : g.ruler.h
  ticks(ctx, holesOf.major, lanesStart, g.foot.y - lanesStart)

  // The axis: its line along the foot of the ruler, and ticks up from it, the major ones longer.
  ctx.strokeStyle = theme.edge
  ctx.beginPath()
  ctx.moveTo(paperX, g.ruler.h - 0.5)
  ctx.lineTo(g.width, g.ruler.h - 0.5)
  ctx.stroke()
  ticks(ctx, holesOf.minor, g.ruler.h - 1, -5)
  ticks(ctx, holesOf.major, g.ruler.h - 1, -10)
  // Each lane is ruled off from the next; the foot closes the last.
  ctx.strokeStyle = theme.paperRule
  for (const lane of g.lanes) rule(ctx, paperX, g.width, lane.y + 0.5)
  rule(ctx, paperX, g.width, g.foot.y + 0.5)

  const lanesTop = g.lanes.length > 0 ? g.lanes[0].y : g.ruler.h
  const lanesBottom = g.foot.y

  // What the learner has said, under the ink: each mark's stretch of the lanes in its category's colour.
  for (const mark of input.marks) {
    if (mark.toNs <= win.fromNs || mark.fromNs >= win.toNs) continue
    const x0 = Math.max(g.plotX, xOf(g, win, mark.fromNs))
    const x1 = Math.min(g.plotX + g.plotW, xOf(g, win, mark.toNs))
    const category = mark.category === null ? null : theme.categories[mark.category]
    ctx.fillStyle = category === null ? wash(theme.paperInk, 7) : wash(category.fill, mark.category === 'both-idle' ? 28 : 17)
    ctx.fillRect(x0, lanesTop, x1 - x0, lanesBottom - lanesTop)
    ctx.fillStyle = category === null ? theme.edge : category.edge
    if (xOf(g, win, mark.fromNs) >= g.plotX) ctx.fillRect(x0, lanesTop, 1.5, lanesBottom - lanesTop)
    if (xOf(g, win, mark.toNs) <= g.plotX + g.plotW) ctx.fillRect(x1 - 1.5, lanesTop, 1.5, lanesBottom - lanesTop)
  }

  // The step boundaries: a dashed rule down every lane, with a short cap at its head.
  ctx.strokeStyle = theme.edge
  ctx.lineWidth = 1
  ctx.setLineDash([2, 3])
  const edges: number[] = []
  for (const step of index.steps) {
    for (const ns of [step.fromNs, step.toNs]) {
      if (ns < win.fromNs || ns > win.toNs) continue
      const x = Math.round(xOf(g, win, ns)) + 0.5
      if (edges[edges.length - 1] === x) continue
      edges.push(x)
    }
  }
  ctx.beginPath()
  for (const x of edges) {
    ctx.moveTo(x, lanesTop)
    ctx.lineTo(x, lanesBottom)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = theme.edge
  for (const x of edges) ctx.fillRect(x - 3.5, lanesTop, 7, 2)

  // The spans: blocks in the code's colour with its glyph, outlined in the code's edge. Wide blocks first, then the lines that are too thin to be blocks.
  const scale = g.plotW / (win.toNs - win.fromNs)
  const phase = -win.fromNs * scale
  for (let style = 0; style < SPAN_STYLES.length; style++) {
    const n = plan.count[style]
    if (n === 0) continue
    const name = SPAN_STYLES[style]
    const ink = theme.styles[name]
    const rowH = g.lanes.length > 0 ? g.lanes[0].rowH : 20
    const wide = new Path2D()
    const thin = new Path2D()
    const outlines = new Path2D()
    let wideCount = 0
    for (let k = 0; k < n; k++) {
      const x = plan.x[style][k]
      const w = plan.w[style][k]
      const y = plan.y[style][k]
      const h = rowH
      if (w >= WIDE_PX) {
        wide.rect(x, y, w, h)
        outlines.rect(x + 0.5, y + 0.5, w - 1, h - 1)
        wideCount++
      } else {
        thin.rect(x, y, Math.max(w, 1), h)
      }
    }
    if (wideCount > 0) {
      ctx.fillStyle = name === 'note' ? theme.paper : ink.fill
      ctx.fill(wide)
      paintPattern(ctx, patterns[name], wide, phase, dpr)
      ctx.strokeStyle = ink.edge
      ctx.lineWidth = 1
      if (name === 'note') ctx.setLineDash([3, 2])
      ctx.stroke(outlines)
      ctx.setLineDash([])
    }
    ctx.fillStyle = ink.edge
    ctx.fill(thin)
  }

  paintCursor(input, lanesTop)
  if (input.pendingNs !== null && input.pendingNs >= win.fromNs && input.pendingNs <= win.toNs) {
    const x = Math.round(xOf(g, win, input.pendingNs)) + 0.5
    ctx.strokeStyle = theme.paperInk
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 3])
    ctx.beginPath()
    ctx.moveTo(x, g.ruler.h)
    ctx.lineTo(x, lanesBottom)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (g.rail.h > 0) paintRail(input)
  paintPending(input)
}

/** The mark being made: a slip, dashed, from where it began to the edge the cursor is on, which stretches as the cursor walks. */
function paintPending(input: PaintInput): void {
  const { ctx, g, theme, win, cursor, index, pendingNs } = input
  if (pendingNs === null || cursor === null || g.rail.h === 0) return
  const there = cursor.edge === 'start' ? spanStart(index, cursor.span) : spanEnd(index, cursor.span)
  const a = xOf(g, win, Math.min(pendingNs, there))
  const b = xOf(g, win, Math.max(pendingNs, there))
  if (b < g.plotX || a > g.plotX + g.plotW) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.plotX, g.rail.y, g.plotW, g.rail.h)
  ctx.clip()
  const x0 = Math.max(g.plotX, a)
  const x1 = Math.max(Math.min(g.plotX + g.plotW, b), x0 + 2)
  ctx.fillStyle = theme.well
  ctx.fillRect(x0, g.rail.y + 4, x1 - x0, g.rail.h - 8)
  ctx.strokeStyle = theme.paperInk
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.strokeRect(x0 + 0.75, g.rail.y + 4.75, Math.max(x1 - x0 - 1.5, 0), g.rail.h - 9.5)
  ctx.setLineDash([])
  ctx.restore()
}

function paintPattern(ctx: CanvasRenderingContext2D, pattern: CanvasPattern | null, path: Path2D, phase: number, dpr: number): void {
  if (pattern === null) return
  pattern.setTransform(new DOMMatrix().translate(phase, 0).scale(1 / dpr))
  ctx.fillStyle = pattern
  ctx.fill(path)
}

interface CursorBox {
  readonly span: number
  readonly box: LaneBox
  readonly y: number
  readonly x0: number
  readonly x1: number
  readonly cx: number
  readonly cy: number
  readonly edgeX: number
  readonly visible: boolean
}

/** Where the cursor's span sits on the paper, or null with no cursor. */
function cursorBoxOf(input: PaintInput): CursorBox | null {
  const { g, index, win, cursor } = input
  if (cursor === null) return null
  const span = cursor.span
  const lane = index.lanes[index.spanLane[span]]
  const box = g.lanes[lane.index]
  const y = rowY(box, lane.row[index.spanPos[span]])
  const left = xOf(g, win, spanStart(index, span))
  const right = xOf(g, win, spanEnd(index, span))
  const x0 = Math.max(g.plotX, left)
  const x1 = Math.min(g.plotX + g.plotW, Math.max(right, left + 1))
  return { span, box, y, x0, x1, cx: (x0 + x1) / 2, cy: y + box.rowH / 2, edgeX: cursor.edge === 'start' ? left : right, visible: right >= g.plotX && left <= g.plotX + g.plotW }
}

/**
 * The cursor, which is the marker (REDESIGN 2.8, the One Marker Rule): a ring round the span it stands on, and the "now" line down
 * the lanes at the edge it is on, each amber with its dark edge. The partners of the span's correlation id are joined to it by a
 * dashed link, which joins a call to its kernel.
 */
function paintCursor(input: PaintInput, lanesTop: number): void {
  const { ctx, g, theme, index, win } = input
  const at = cursorBoxOf(input)
  if (at === null) return
  if (at.visible) {
    const partners = correlated(index, at.span)
    if (partners.length > 0) {
      ctx.strokeStyle = theme.paperInk
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      for (const other of partners) {
        const otherLane = index.lanes[index.spanLane[other]]
        const ox = (xOf(g, win, spanStart(index, other)) + xOf(g, win, spanEnd(index, other))) / 2
        if (ox < g.plotX || ox > g.plotX + g.plotW) continue
        const oy = rowY(g.lanes[otherLane.index], otherLane.row[index.spanPos[other]]) + at.box.rowH / 2
        ctx.moveTo(at.cx, at.cy)
        ctx.lineTo(ox, oy)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
    // The ring: paper under the marker's edge under its amber, so that it stands out on any block, and tells from the focus ring, which is ink.
    const w = Math.max(at.x1 - at.x0, 2) + 3
    const ring = (x: number, y: number, width: number, height: number, color: string, line: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = line
      ctx.strokeRect(x, y, width, height)
    }
    ring(at.x0 - 1.5, at.y - 1.5, w, at.box.rowH + 3, theme.paper, 7)
    ring(at.x0 - 1.5, at.y - 1.5, w, at.box.rowH + 3, theme.lampRing, 5)
    ring(at.x0 - 1.5, at.y - 1.5, w, at.box.rowH + 3, theme.lamp, 3)
  }
  if (at.edgeX >= g.plotX && at.edgeX <= g.plotX + g.plotW) {
    // The line: 2 px of amber with a 1 px edge on each side, from the top of the lanes to the foot, where its word stands.
    const x = Math.round(at.edgeX)
    ctx.fillStyle = theme.lampRing
    ctx.fillRect(x - 2, lanesTop, 4, g.foot.y + g.foot.h - lanesTop)
    ctx.fillStyle = theme.lamp
    ctx.fillRect(x - 1, lanesTop, 2, g.foot.y + g.foot.h - lanesTop)
  }
}

/** The rail: each mark as a paper slip across it, with its category's edge below. */
function paintRail(input: PaintInput): void {
  const { ctx, g, theme, win, marks, active, cause, index } = input
  const top = g.rail.y + 4
  const h = g.rail.h - 8
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.plotX, g.rail.y, g.plotW, g.rail.h)
  ctx.clip()
  for (const mark of marks) {
    if (mark.toNs <= win.fromNs || mark.fromNs >= win.toNs) continue
    const x0 = xOf(g, win, mark.fromNs)
    const x1 = Math.max(xOf(g, win, mark.toNs), x0 + 14)
    const category = mark.category === null ? null : theme.categories[mark.category]
    ctx.fillStyle = theme.well
    ctx.fillRect(x0, top, x1 - x0, h)
    ctx.strokeStyle = theme.edge
    ctx.lineWidth = 1
    ctx.strokeRect(x0 + 0.5, top + 0.5, x1 - x0 - 1, h - 1)
    ctx.fillStyle = category === null ? theme.edge : category.edge
    ctx.fillRect(x0 + 1, top + h - 4, Math.max(0, x1 - x0 - 2), 3)
    if (mark.id === active) {
      ctx.strokeStyle = theme.paperInk
      ctx.lineWidth = 2
      ctx.setLineDash([4, 2])
      ctx.strokeRect(x0 - 1, top - 1.5, x1 - x0 + 2, h + 3)
      ctx.setLineDash([])
    }
  }
  if (cause !== null) {
    const x = (xOf(g, win, spanStart(index, cause)) + xOf(g, win, spanEnd(index, cause))) / 2
    if (x >= g.plotX && x <= g.plotX + g.plotW) {
      ctx.fillStyle = theme.paperInk
      ctx.beginPath()
      ctx.moveTo(x - 5, top + h)
      ctx.lineTo(x + 5, top + h)
      ctx.lineTo(x, top + h + 6)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
  paintCause(input)
}

/** The span named as the cause: a ring of ink in dashes round it, the learner's own mark, which is not the cursor's. */
function paintCause(input: PaintInput): void {
  const { ctx, g, theme, win, cause, index } = input
  if (cause === null) return
  const lane = index.lanes[index.spanLane[cause]]
  const box = g.lanes[lane.index]
  const y = rowY(box, lane.row[index.spanPos[cause]])
  const left = xOf(g, win, spanStart(index, cause))
  const right = xOf(g, win, spanEnd(index, cause))
  if (right < g.plotX || left > g.plotX + g.plotW) return
  const x0 = Math.max(g.plotX, left)
  const x1 = Math.min(g.plotX + g.plotW, Math.max(right, left + 2))
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.plotX, g.ruler.h, g.plotW, g.foot.y - g.ruler.h)
  ctx.clip()
  ctx.strokeStyle = theme.paperInk
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 2])
  ctx.strokeRect(x0 - 3.5, y - 3.5, x1 - x0 + 7, box.rowH + 7)
  ctx.restore()
}
