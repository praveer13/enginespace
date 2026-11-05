/*
 * The painter: one frame of the tape on a Canvas2D context (GAMES.md §2.6, The Tape; DESIGN.md). It draws the paper and its feed holes,
 * the lanes' perforation, the marks' washes, the bells, the plan's blocks of printer dots, the cursor's lamp and the marks stuck on
 * the rail. It writes no text: every number and every name is DOM over the canvas (D-021, §2.6 rule 7), and the canvas holds
 * nothing the table beside it does not.
 *
 * A span is a block of dots in its board colour with an edge in the code's edge colour. Solid kinds are dense dots over their
 * colour, a copy is sparse dots on the paper, a sync is hatching, and a note is an outline. The dots are one pattern tile per kind,
 * shifted with the window so that they travel with the paper as it feeds past. All of it is drawn from the token roles in the theme.
 */
import { rowY } from './geometry'
import type { LaneBox, TapeGeometry } from './geometry'
import { correlated, spanEnd, spanStart } from './model'
import type { Cursor, TraceIndex, Win } from './model'
import { SPAN_STYLES } from './model'
import type { Mark } from './marks'
import { WIDE_PX } from './plan'
import type { DrawPlan } from './plan'
import { wash } from './theme'
import type { TapeTheme } from './theme'

const TAU = Math.PI * 2
/** The pitch of the dots, in CSS px. */
const PITCH = 3
const SPARSE_PITCH = 5
const HATCH_PITCH = 5

export interface Patterns {
  readonly dots: CanvasPattern | null
  readonly sparse: CanvasPattern | null
  readonly hatch: CanvasPattern | null
}

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

/** The three pattern tiles of a theme at a pixel ratio, made once. */
export function patternsFor(theme: TapeTheme, dpr: number): Patterns {
  let byRatio = cache.get(theme)
  if (byRatio === undefined) {
    byRatio = new Map()
    cache.set(theme, byRatio)
  }
  const known = byRatio.get(dpr)
  if (known !== undefined) return known
  const made: Patterns = {
    // Printer dots, in the ink of the block's edge, over the block's colour.
    dots: tile(PITCH, dpr, (c, px) => {
      c.fillStyle = theme.paperInk
      c.globalAlpha = 0.32
      c.beginPath()
      c.arc(px / 2, px / 2, 0.62 * dpr, 0, TAU)
      c.fill()
    }),
    // A copy: large sparse dots on the paper, the dumbwaiter running with nothing cooking.
    sparse: tile(SPARSE_PITCH, dpr, (c, px) => {
      c.fillStyle = theme.styles.copy.edge
      c.beginPath()
      c.arc(px / 2, px / 2, 1.35 * dpr, 0, TAU)
      c.fill()
    }),
    // A sync: hatching, "Heard!".
    hatch: tile(HATCH_PITCH, dpr, (c, px) => {
      c.strokeStyle = theme.styles.sync.edge
      c.lineWidth = 1.2 * dpr
      c.beginPath()
      c.moveTo(-1, px + 1)
      c.lineTo(px + 1, -1)
      c.moveTo(-1, 1)
      c.lineTo(1, -1)
      c.moveTo(px - 1, px + 1)
      c.lineTo(px + 1, px - 1)
      c.stroke()
    }),
  }
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

function holes(ctx: CanvasRenderingContext2D, xs: readonly number[], y: number, r: number): void {
  ctx.beginPath()
  for (const x of xs) {
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, TAU)
  }
  ctx.fill()
}

function perforation(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number): void {
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x1, y)
  ctx.stroke()
}

/** The ticks of the ruler as holes, major and minor, and the foot's holes, which are the same marks without numbers. */
export interface RulerHoles {
  readonly minor: readonly number[]
  readonly major: readonly number[]
}

export function paintTape(input: PaintInput, holesOf: RulerHoles): void {
  const { ctx, dpr, g, theme, patterns, index, win, plan } = input
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, g.width, g.height)

  // The paper, with its left edge lifted off the steel.
  const paperX = g.gutter
  ctx.fillStyle = theme.paper
  ctx.fillRect(paperX, 0, g.width - paperX, g.height)
  if (g.gutter > 0) {
    const shade = ctx.createLinearGradient(paperX - 8, 0, paperX, 0)
    shade.addColorStop(0, wash(theme.paperInk, 0))
    shade.addColorStop(1, wash(theme.paperInk, 26))
    ctx.fillStyle = shade
    ctx.fillRect(paperX - 8, 0, 8, g.height)
    ctx.fillStyle = theme.edge
    ctx.fillRect(paperX, 0, 1, g.height)
  }

  // The feed-hole rails: the ruler along the top, and the foot. A hole shows the steel under the paper.
  ctx.fillStyle = theme.steelDeep
  holes(ctx, holesOf.minor, 11, 2.1)
  holes(ctx, holesOf.major, 11, 3.5)
  holes(ctx, holesOf.minor, g.foot.y + g.foot.h / 2, 2.1)
  holes(ctx, holesOf.major, g.foot.y + g.foot.h / 2, 3.5)
  ctx.strokeStyle = theme.paperRule
  ctx.lineWidth = 1
  ctx.setLineDash([1.5, 3])
  perforation(ctx, paperX, g.width, g.ruler.h - 0.5)
  perforation(ctx, paperX, g.width, g.foot.y + 0.5)
  for (const lane of g.lanes) perforation(ctx, paperX, g.width, lane.y + 0.5)
  ctx.setLineDash([])

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

  paintLamp(input, lanesBottom)

  // The bells: a perforation rule down every lane at each step mark, and a small bell at its head.
  ctx.strokeStyle = theme.edge
  ctx.lineWidth = 1
  ctx.setLineDash([2, 3])
  const bells: number[] = []
  for (const step of index.steps) {
    for (const ns of [step.fromNs, step.toNs]) {
      if (ns < win.fromNs || ns > win.toNs) continue
      const x = Math.round(xOf(g, win, ns)) + 0.5
      if (bells[bells.length - 1] === x) continue
      bells.push(x)
    }
  }
  ctx.beginPath()
  for (const x of bells) {
    ctx.moveTo(x, lanesTop)
    ctx.lineTo(x, lanesBottom)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = theme.steelDeep
  for (const x of bells) bell(ctx, x, lanesTop + 1)

  // The spans: dots in the board colour, outlined in the code's edge. Wide blocks first, then the lines that are too thin to be blocks.
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
      if (name === 'frame' || name === 'launch' || name === 'kernel') {
        ctx.fillStyle = ink.fill
        ctx.fill(wide)
        paintPattern(ctx, patterns.dots, wide, phase, dpr)
      } else if (name === 'copy') {
        ctx.fillStyle = theme.paper
        ctx.fill(wide)
        paintPattern(ctx, patterns.sparse, wide, phase, dpr)
      } else if (name === 'sync') {
        ctx.fillStyle = ink.fill
        ctx.fill(wide)
        paintPattern(ctx, patterns.hatch, wide, phase, dpr)
      }
      ctx.strokeStyle = ink.edge
      ctx.lineWidth = 1
      if (name === 'note') ctx.setLineDash([3, 2])
      ctx.stroke(outlines)
      ctx.setLineDash([])
    }
    ctx.fillStyle = ink.edge
    ctx.fill(thin)
  }

  paintCursor(input, lanesTop, lanesBottom)
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

/** The mark being made: a strip of tape, dashed, from where it began to the edge the cursor is on, which stretches as the cursor walks. */
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
  ctx.fillStyle = wash(theme.tape, 70)
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

/** A bell: a dome on a rim, the step mark's head. */
function bell(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath()
  ctx.moveTo(x - 4.5, y + 8)
  ctx.quadraticCurveTo(x - 4.5, y + 0.5, x, y + 0.5)
  ctx.quadraticCurveTo(x + 4.5, y + 0.5, x + 4.5, y + 8)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(x - 5.5, y + 8, 11, 1.5)
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
 * The heat lamp's light (DESIGN.md, "The One Lamp Rule"): the cursor's span in an edgeless pool on the paper. It is painted under
 * the ink, as light falls on paper, so the blocks keep their board colours.
 */
function paintLamp(input: PaintInput, lanesBottom: number): void {
  const { ctx, g, theme } = input
  const at = cursorBoxOf(input)
  if (at === null || !at.visible) return
  const reach = Math.max(34, (at.x1 - at.x0) / 2 + 22)
  ctx.save()
  ctx.beginPath()
  ctx.rect(g.plotX, g.ruler.h, g.plotW, lanesBottom - g.ruler.h)
  ctx.clip()
  ctx.translate(at.cx, at.cy)
  ctx.scale(reach / 24, 1)
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 24)
  pool.addColorStop(0, wash(theme.lamp, 88))
  pool.addColorStop(0.55, wash(theme.lamp, 42))
  pool.addColorStop(1, wash(theme.lamp, 0))
  ctx.fillStyle = pool
  ctx.fillRect(-24, -at.box.rowH / 2 - 20, 48, at.box.rowH + 40)
  ctx.restore()
}

/**
 * The lamp's filament: a ring round the cursor's span, and the reading line down the lanes at the edge the cursor stands on. The
 * partners of the span's correlation id are joined to it by a dashed link, which joins a call to its dish.
 */
function paintCursor(input: PaintInput, lanesTop: number, lanesBottom: number): void {
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
    // The filament: a ring of paper under a ring of lamp-ring, so that it stands out on any block, and the lamp's own light
    // spilling above it, as it does above a focused control (DESIGN.md, "Do": the focus ring with the lamp's glow above it).
    const w = Math.max(at.x1 - at.x0, 2) + 3
    ctx.save()
    ctx.shadowColor = wash(theme.lamp, 85)
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = -3
    ctx.strokeStyle = theme.paper
    ctx.lineWidth = 4
    ctx.strokeRect(at.x0 - 2.5, at.y - 2.5, w + 2, at.box.rowH + 5)
    ctx.restore()
    ctx.strokeStyle = theme.lampRing
    ctx.lineWidth = 2
    ctx.strokeRect(at.x0 - 1.5, at.y - 1.5, w, at.box.rowH + 3)
  }
  if (at.edgeX >= g.plotX && at.edgeX <= g.plotX + g.plotW) {
    const x = Math.round(at.edgeX) + 0.5
    ctx.fillStyle = theme.lampRing
    ctx.fillRect(x - 0.75, lanesTop, 1.5, lanesBottom - lanesTop)
    ctx.beginPath()
    ctx.moveTo(x - 5, lanesTop - 6)
    ctx.lineTo(x + 5, lanesTop - 6)
    ctx.lineTo(x, lanesTop)
    ctx.closePath()
    ctx.fill()
  }
}

/** The rail: each mark as masking tape stuck across it, torn at both ends, with its category's edge below. */
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
    tape(ctx, x0, x1, top, h, theme.tape)
    ctx.fillStyle = category === null ? theme.edge : category.edge
    ctx.fillRect(x0 + 2, top + h - 3, Math.max(0, x1 - x0 - 4), 3)
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

/** The span named as the cause: a ring of ink in dashes round it, the learner's own mark, which is not the lamp's. */
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

/** A strip of masking tape: the roll's colour, a lit top edge and a torn end at each side. */
function tape(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, h: number, color: string): void {
  const tooth = 3
  const teeth = Math.max(2, Math.floor(h / 4))
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x1, y)
  for (let i = 1; i <= teeth; i++) ctx.lineTo(x1 - (i % 2 === 0 ? 0 : tooth), y + (h * i) / teeth)
  ctx.lineTo(x0, y + h)
  for (let i = teeth - 1; i >= 0; i--) ctx.lineTo(x0 + (i % 2 === 0 ? 0 : tooth), y + (h * i) / teeth)
  ctx.closePath()
  ctx.fill()
}
