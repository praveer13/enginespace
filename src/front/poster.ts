/*
 * The step loop's poster (ARCHITECTURE §6.11): the first frame of the front page's timing diagram, as a file. scripts/posters.ts writes it to
 * public/posters/, and the front page inlines it.
 *
 * It is the lane layout's own drawing (packages/play/loop/lanes.ts, REDESIGN §2.9): the practice seed of the first demo level, as a view of
 * the session, laid out at the front page's two geometries (DESK for the landscape poster, PHONE for the portrait one) and written as SVG
 * from the same boxes the 2D diagram draws: the waiting queue's chips, the CPU row and the four slot rows on the graticule, each empty slot's
 * dashed holder, the now line at tick 0, and the axis in synthetic ticks. So a poster cannot drift from the diagram: tests/play/loop-poster.test.ts
 * holds the file to this code, byte for byte.
 *
 * The front page itself draws no poster: its static HTML is the diagram, rendered once by the build from the same session. Nothing in the
 * app imports this module, so its code never reaches the front page's first paint.
 *
 * The SVG paints with the design system's custom properties and nothing else, so it takes the look of the page that holds it.
 */
import { DESK, LANE_WORDS, laneLayout, PHONE, requestName, type LaneGeometry } from '@es/play/loop/lanes'
import { loopInit, loopLevel, loopView } from '@es/play/loop/session'
import { num, type SvgNode } from '@es/play/loop/svg'
import type { LoopView } from '@es/play/loop/types'

/** The level and seed the front page opens on: the first demo level, on its practice seed (packages/play/loop/entry.ts, D-038). */
export const POSTER_LEVEL = 'first-1-fill'
export const POSTER_SEED = 1

export type Orientation = 'landscape' | 'portrait'
export const ORIENTATIONS: readonly Orientation[] = ['landscape', 'portrait']

/** The geometry of each poster: the front page's instrument at 1440 and at 390 (lanes.ts, REDESIGN §3.1). */
export const POSTER_GEOMETRY: Readonly<Record<Orientation, LaneGeometry>> = { landscape: DESK, portrait: PHONE }

/** The paper's margin round the drawing, in px. */
const MARGIN = 12

/** The session's first view at the poster's level and seed. */
export function posterView(): LoopView {
  return loopView(loopInit(loopLevel(POSTER_LEVEL, POSTER_SEED)))
}

const el = (tag: string, attrs: SvgNode['attrs'], children?: SvgNode['children']): SvgNode => (children === undefined ? { tag, attrs } : { tag, attrs, children })
const label = (x: number, y: number, text: string, size: number, extra: SvgNode['attrs'] = {}): SvgNode =>
  el('text', { x: num(x), y: num(y), fill: 'var(--es-text-1)', fontSize: size, fontWeight: 700, dominantBaseline: 'central', ...extra }, [text])

/** The drawing of a view at one orientation's geometry: the poster. */
export function passDrawing(view: LoopView, orientation: Orientation): SvgNode {
  const g = POSTER_GEOMETRY[orientation]
  const narrow = orientation === 'portrait'
  const layout = laneLayout(view, g)
  const { scale } = layout
  const width = g.width + MARGIN * 2
  const height = layout.height + MARGIN * 2
  const lanesTop = g.queueHeight + g.queueGap
  const small = narrow ? 11 : 13

  const chips = layout.queue.chips.map((chip) =>
    el('g', { 'data-req': chip.req }, [
      el('rect', { x: num(chip.x + 0.5), y: num(chip.y + 0.5), width: num(chip.width - 1), height: num(chip.height - 1), fill: 'var(--es-paper)', stroke: 'var(--es-edge)', strokeWidth: 1 }),
      label(chip.x + chip.width / 2, chip.y + chip.height / 2, chip.label, small, { textAnchor: 'middle' }),
    ]),
  )
  const minor: SvgNode[] = []
  for (let t = Math.ceil(scale.start); t <= scale.end; t++) {
    const x = scale.x + (t - scale.start) * scale.pxPerTick
    minor.push(el('line', { x1: num(x), x2: num(x), y1: lanesTop, y2: layout.axis.y, stroke: 'var(--es-paper-rule)', strokeWidth: 1 }))
  }
  const rows = layout.rows.flatMap((row) => {
    const words = row.lane === 'cpu' ? (narrow ? LANE_WORDS.cpuShort : LANE_WORDS.cpu) : narrow ? String((row.slot ?? 0) + 1) : LANE_WORDS.slot(row.slot ?? 0)
    const holds =
      row.lane === 'gpu'
        ? [
            el('rect', { x: narrow ? 22 : 62, y: num(row.y + 6), width: narrow ? 44 : 88, height: num(row.height - 12), fill: 'none', stroke: 'var(--es-edge)', strokeWidth: 1, strokeDasharray: '3 3' }),
            label(narrow ? 44 : 106, row.y + row.height / 2, row.req === null ? LANE_WORDS.empty : requestName(row.req), small - 1, { textAnchor: 'middle', fontWeight: 400 }),
          ]
        : []
    return [
      el('line', { x1: num(scale.x), x2: num(scale.x + scale.width), y1: num(row.y), y2: num(row.y), stroke: 'var(--es-paper-rule)', strokeWidth: 1 }),
      label(4, row.y + (row.lane === 'gpu' ? row.height / 2 : row.height / 2), words, small, { 'data-row': row.id }),
      ...holds,
    ]
  })
  const axis = layout.axis.ticks.flatMap((tick) => [
    el('line', { x1: num(tick.x), x2: num(tick.x), y1: num(layout.axis.y), y2: num(layout.axis.y + 4), stroke: 'var(--es-edge)', strokeWidth: 1 }),
    label(tick.x, layout.axis.y + 12, String(tick.t), small - 2, { textAnchor: tick.x <= scale.x + 4 ? 'start' : 'middle', fontWeight: 400, fill: 'var(--es-text-3)' }),
  ])

  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${num(width)} ${num(height)}`,
      width: num(width),
      height: num(height),
      role: 'img',
      'aria-label': `Timing diagram of the step loop, first frame: ${layout.queue.chips.length + layout.queue.more} requests waiting, ${view.slots} empty batch slots, now at tick 0, in synthetic ticks.`,
      'data-poster': orientation,
    },
    [
      el('rect', { x: 0, y: 0, width: num(width), height: num(height), fill: 'var(--es-paper)' }),
      el('g', { transform: `translate(${MARGIN} ${MARGIN})` }, [
        label(4, g.queueHeight / 2, LANE_WORDS.queue, small),
        el('g', { 'data-part': 'queue' }, chips),
        el('g', { 'data-part': 'graticule' }, minor),
        el('g', { 'data-part': 'rows' }, rows),
        el('line', { x1: num(scale.x), x2: num(scale.x + scale.width), y1: num(layout.axis.y), y2: num(layout.axis.y), stroke: 'var(--es-edge)', strokeWidth: 1 }),
        el('g', { 'data-part': 'axis' }, axis),
        el('rect', { x: num(layout.now.x - 1), y: num(layout.now.y0), width: 2, height: num(layout.now.y1 - layout.now.y0), fill: 'var(--es-lamp)', stroke: 'var(--es-lamp-ring)', strokeWidth: 0.5, 'data-part': 'now' }),
      ]),
    ],
  )
}
