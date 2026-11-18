/*
 * The figures' drawing kit (REDESIGN §2.8): the language of the diagrams, for the figures that sit in a lesson's column.
 *
 *   - the six-colour code, each colour with its glyph or hatch (src/design/code.ts), read from the tokens, never typed twice;
 *   - the graticule, faint lines at 8 px and 40 px, only where it is a time axis or a cell grid;
 *   - dimension lines: an interval is marked with end ticks and its value, as in an engineering drawing;
 *   - mono labels for every number the learner compares, a plain face for names, and a paper halo round every word so a word stays
 *     legible over the graticule.
 *
 * A figure is an `<img>`, so it cannot inherit the page's ink or its faces: it carries its own colours (the token values) and falls back
 * to system faces. It is 360 wide and fills the column at that scale, so the 10 px that every word is set at reads at 10 px in a column
 * of 358 px, which is the least that the figures' test accepts.
 *
 * The drawing code lives in `tests/content` beside the models it draws (the generators and `tests/content/*-module.test.ts`), and
 * `tests/content/figures.test.ts` holds every file under public/figures to this language.
 */
import { ROLES, SLOT_MARKS, SLOTS } from '../../src/design/tokens'
import type { GlyphShape, RoleName, Slot } from '../../src/design/tokens'

/** The literal hex of a colour role, following a role that stands for another. */
function hexOf(name: string): string {
  const role = ROLES[name as RoleName] as { kind: string; value: string | { ref: string } } | undefined
  if (role === undefined || role.kind !== 'color') throw new Error(`no colour role ${name}`)
  return typeof role.value === 'string' ? role.value : hexOf(role.value.ref)
}

/** The page's colours that a figure may use besides the six. */
export const PAPER = hexOf('paper')
export const RULE = hexOf('paper-rule')
export const EDGE = hexOf('edge')
export const INK = hexOf('text-1')
export const INK_2 = hexOf('text-2')

/** The six code colours: the fill, the edge, and the text on the fill. */
export const CODE: Readonly<Record<Slot, { fill: string; edge: string; ink: string }>> = Object.fromEntries(
  SLOTS.map((slot) => [slot, { fill: hexOf(`cat-${slot}`), edge: hexOf(`cat-${slot}-edge`), ink: hexOf(`cat-${slot}-ink`) }]),
) as Record<Slot, { fill: string; edge: string; ink: string }>

/** Every colour a figure may carry, for the test that holds a file to the language. */
export const ALLOWED_COLOURS: readonly string[] = [PAPER, RULE, EDGE, INK, INK_2, ...SLOTS.flatMap((slot) => [CODE[slot].fill, CODE[slot].edge, CODE[slot].ink])].map((c) => c.toLowerCase())

/** The faces: an image cannot load the page's fonts, so each falls back to the system's own. */
export const SANS = "'Atkinson Hyperlegible', system-ui, 'Segoe UI', Arial, sans-serif"
export const MONO = "'Atkinson Hyperlegible Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

/** The least a word is set at, and the width every figure is drawn at. */
export const MIN_TEXT = 10
export const WIDTH = 360

/** The width of a string, estimated in the face it is set in (a mono face is 0.6 em a character, and so is the widest plain face a system may fall back to). */
export const textWidth = (s: string, size = MIN_TEXT): number => s.length * size * 0.6

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** A coordinate, trimmed. */
export const fmt = (x: number): string => String(Number(x.toFixed(2)))
/** A number with its thousands separators. */
export const n = (x: number): string => x.toLocaleString('en-US')

export interface TextOptions {
  readonly size?: number
  readonly anchor?: 'start' | 'middle' | 'end'
  readonly mono?: boolean
  readonly bold?: boolean
  readonly fill?: string
  /** No halo: the word sits on a fill that it is set against. */
  readonly bare?: boolean
}

export interface MarkOptions {
  /** A dashed outline and no fill: an idle stretch, a free place, a gap. */
  readonly hollow?: boolean
  /** A word inside the mark, in the colour's own ink, when it fits beside the glyph. */
  readonly label?: string
  /** No glyph in the mark even when it has room (the legend still names it). */
  readonly noGlyph?: boolean
  /** The mark's own class, for a test to count: `cell`, `span` and so on. */
  readonly kind?: string
}

/** The path of a glyph of the code, centred on (cx, cy) with radius r. */
function glyphShape(shape: GlyphShape, cx: number, cy: number, r: number, paint: string): string {
  const p = (pts: [number, number][]): string => pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')
  switch (shape) {
    case 'circle':
      return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${paint}"/>`
    case 'ring':
      return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r - 0.5)}" fill="none" stroke="${paint}" stroke-width="1.5"/>`
    case 'square':
      return `<rect x="${fmt(cx - r + 0.5)}" y="${fmt(cy - r + 0.5)}" width="${fmt(2 * r - 1)}" height="${fmt(2 * r - 1)}" fill="${paint}"/>`
    case 'diamond':
      return `<polygon points="${p([[cx, cy - r - 0.5], [cx + r + 0.5, cy], [cx, cy + r + 0.5], [cx - r - 0.5, cy]])}" fill="${paint}"/>`
    case 'triangle':
      return `<polygon points="${p([[cx, cy - r], [cx + r + 0.5, cy + r - 0.5], [cx - r - 0.5, cy + r - 0.5]])}" fill="${paint}"/>`
    case 'hexagon':
      return `<polygon points="${p([[cx - r, cy], [cx - r / 2, cy - r * 0.87], [cx + r / 2, cy - r * 0.87], [cx + r, cy], [cx + r / 2, cy + r * 0.87], [cx - r / 2, cy + r * 0.87]])}" fill="${paint}"/>`
  }
}

/** A slot's glyph, drawn on its own fill: the colour's ink on a solid fill, the colour's edge on the two that are light. */
export function glyph(slot: Slot, cx: number, cy: number, r = 3.5): string {
  const light = slot === 'yellow' || slot === 'white'
  return `<g class="glyph" data-slot="${slot}">${glyphShape(SLOT_MARKS[slot].glyph, cx, cy, r, light ? CODE[slot].edge : CODE[slot].ink)}</g>`
}

/** The figure being drawn: a body of elements, the code colours it used (for its patterns and its legend), and its size. */
export class Fig {
  private readonly body: string[] = []
  private readonly used = new Set<Slot>()
  private readonly title: string
  private readonly description: string
  height: number

  constructor(height: number, title: string, description: string) {
    this.height = height
    this.title = title
    this.description = description
  }

  add(...parts: string[]): this {
    this.body.push(...parts)
    return this
  }

  /** A word, in the plain face for names and the mono face for numbers, with a halo of paper so it reads over a line. */
  text(x: number, y: number, s: string, o: TextOptions = {}): this {
    const size = o.size ?? MIN_TEXT
    const halo = o.bare === true ? '' : ` stroke="${PAPER}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`
    this.body.push(
      `<text x="${fmt(x)}" y="${fmt(y)}" font-family="${o.mono === true ? MONO : SANS}" font-size="${size}"${o.bold === true ? ' font-weight="700"' : ''} fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? 'start'}"${halo}>${esc(s)}</text>`,
    )
    return this
  }

  /** The graticule of a plot: a minor line every 8 px and a major line every 40 px, from the plot's own corner. */
  grid(x: number, y: number, w: number, h: number, minor = 8, major = 40): this {
    const lines = (step: number): string => {
      const v: string[] = []
      for (let dx = 0; dx <= w + 0.01; dx += step) v.push(`M${fmt(x + dx)} ${fmt(y)}v${fmt(h)}`)
      for (let dy = 0; dy <= h + 0.01; dy += step) v.push(`M${fmt(x)} ${fmt(y + dy)}h${fmt(w)}`)
      return v.join('')
    }
    this.body.push(`<g class="graticule" fill="none" stroke="${RULE}"><path d="${lines(minor)}" stroke-width="0.5" stroke-opacity="0.55"/><path d="${lines(major)}" stroke-width="0.75"/></g>`)
    return this
  }

  /** One mark of the code: the colour with its edge, its hatch or dots where the code gives it one, and its glyph where there is room for it. */
  mark(slot: Slot, x: number, y: number, w: number, h: number, o: MarkOptions = {}): this {
    this.used.add(slot)
    const c = CODE[slot]
    const kind = o.kind ?? 'mark'
    const rect = (extra: string): string => `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" ${extra}/>`
    if (o.hollow === true) {
      this.body.push(`<g class="${kind} hollow" data-slot="${slot}">${rect(`fill="${PAPER}" stroke="${c.edge}" stroke-width="1" stroke-dasharray="3 3"`)}</g>`)
      return this
    }
    const parts = [rect(`fill="${c.fill}" stroke="${c.edge}" stroke-width="1"`)]
    const pattern = SLOT_MARKS[slot].pattern
    if (pattern === 'hatch' || pattern === 'dots') parts.push(rect(`fill="url(#code-${slot})" stroke="none"`))
    const roomForGlyph = o.noGlyph !== true && w >= 16 && h >= 12
    if (roomForGlyph) parts.push(glyph(slot, x + 8, y + h / 2))
    if (o.label !== undefined) {
      const lines = o.label.split('\n')
      const room = w - (roomForGlyph ? 16 : 4)
      if (Math.max(...lines.map((l) => textWidth(l) * 1.08)) <= room && lines.length * 12 <= h) {
        const cx = x + (roomForGlyph ? 16 : 2) + room / 2
        const top = y + h / 2 - (lines.length * 12) / 2 + 9.5
        lines.forEach((line, i) => {
          parts.push(
            `<text x="${fmt(cx)}" y="${fmt(top + i * 12)}" font-family="${SANS}" font-size="${MIN_TEXT}" font-weight="700" fill="${c.ink}" text-anchor="middle"${pattern === 'solid' ? '' : ` stroke="${c.fill}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"`}>${esc(line)}</text>`,
          )
        })
      }
    }
    this.body.push(`<g class="${kind}" data-slot="${slot}">${parts.join('')}</g>`)
    return this
  }

  /** An empty place: dashed and hollow, in the white of the code. */
  idle(x: number, y: number, w: number, h: number, kind = 'idle'): this {
    return this.mark('white', x, y, w, h, { hollow: true, kind })
  }

  /**
   * A dimension line: end ticks and a rule between them at y, and the interval's value (a mono label) above it, or below with `below`.
   * The label centres on the interval and may run past it.
   */
  dim(x1: number, x2: number, y: number, value: string, o: { below?: boolean; anchor?: 'start' | 'middle' | 'end' } = {}): this {
    const mid = (x1 + x2) / 2
    const anchor = o.anchor ?? 'middle'
    const lx = anchor === 'middle' ? mid : anchor === 'start' ? x1 : x2
    this.body.push(
      `<g class="dim" data-value="${esc(value)}"><path d="M${fmt(x1)} ${fmt(y - 4)}v8M${fmt(x2)} ${fmt(y - 4)}v8M${fmt(x1)} ${fmt(y)}H${fmt(x2)}" fill="none" stroke="${EDGE}" stroke-width="1"/></g>`,
    )
    this.text(lx, o.below === true ? y + 15 : y - 7, value, { mono: true, anchor })
    return this
  }

  /** A dimension line down the page, with its value to the left of it (a group of rows, a stack of pages). */
  vdim(x: number, y1: number, y2: number, value: string): this {
    this.body.push(
      `<g class="dim" data-value="${esc(value)}"><path d="M${fmt(x - 4)} ${fmt(y1)}h8M${fmt(x - 4)} ${fmt(y2)}h8M${fmt(x)} ${fmt(y1)}V${fmt(y2)}" fill="none" stroke="${EDGE}" stroke-width="1"/></g>`,
    )
    this.text(x - 8, (y1 + y2) / 2 + 3.5, value, { mono: true, anchor: 'end' })
    return this
  }

  /** A time or count axis: a rule with a tick and a mono label at every `step`, from x0 at `scale` px a unit. */
  axis(x0: number, y: number, scale: number, to: number, step: number, unit?: string): this {
    const ticks: string[] = []
    for (let v = 0; v <= to + 0.001; v += step) ticks.push(`M${fmt(x0 + v * scale)} ${fmt(y)}v4`)
    this.body.push(`<path class="axis" d="M${fmt(x0)} ${fmt(y)}H${fmt(x0 + to * scale)}${ticks.join('')}" fill="none" stroke="${EDGE}" stroke-width="1"/>`)
    for (let v = 0; v <= to + 0.001; v += step) this.text(x0 + v * scale, y + 15, n(v), { mono: true, anchor: 'middle' })
    if (unit !== undefined) this.text(x0 + to * scale, y + 29, unit, { mono: true, anchor: 'end' })
    return this
  }

  /** An arrow of the plain kind: a line with a small head, in the edge's ink. */
  arrow(x1: number, y1: number, x2: number, y2: number, dashed = false, colour: string = INK_2): this {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const hx = (d: number): number => x2 - 6 * Math.cos(a + d)
    const hy = (d: number): number => y2 - 6 * Math.sin(a + d)
    this.body.push(
      `<path class="arrow" d="M${fmt(x1)} ${fmt(y1)}L${fmt(x2)} ${fmt(y2)}M${fmt(hx(0.45))} ${fmt(hy(0.45))}L${fmt(x2)} ${fmt(y2)}L${fmt(hx(-0.45))} ${fmt(hy(-0.45))}" fill="none" stroke="${colour}" stroke-width="1.25"${dashed ? ' stroke-dasharray="3 3"' : ''}/>`,
    )
    return this
  }

  /** A path of the edge's ink: a connector, a bracket or a rule. */
  rule(d: string, dashed = false, width = 1): this {
    this.body.push(`<path d="${d}" fill="none" stroke="${EDGE}" stroke-width="${width}"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`)
    return this
  }

  /**
   * The legend: a swatch with its glyph (and hatch) and the word it stands for, for each of the entries, flowing across the width and
   * wrapping. It returns the y of the line below the last, for the figure's height.
   */
  legend(entries: readonly { slot: Slot; word: string; hollow?: boolean }[], x: number, y: number, right = WIDTH - 4): number {
    let cx = x
    let cy = y
    for (const e of entries) {
      const width = 20 + textWidth(e.word, MIN_TEXT) + 12
      if (cx + width > right && cx > x) {
        cx = x
        cy += 18
      }
      this.mark(e.slot, cx, cy, 16, 12, { hollow: e.hollow, kind: 'key', noGlyph: true })
      this.add(glyph(e.slot, cx + 8, cy + 6))
      this.text(cx + 20, cy + 10, e.word, { mono: true })
      cx += width
    }
    return cy + 18
  }

  /** The finished file: the svg, its title and description, the patterns the used colours need, and the paper under everything. */
  svg(): string {
    const defs: string[] = []
    for (const slot of SLOTS) {
      if (!this.used.has(slot)) continue
      const pattern = SLOT_MARKS[slot].pattern
      const c = CODE[slot]
      if (pattern === 'hatch') defs.push(`<pattern id="code-${slot}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="${c.edge}" stroke-width="1.5" stroke-opacity="0.7"/></pattern>`)
      if (pattern === 'dots') defs.push(`<pattern id="code-${slot}" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="${c.ink}" fill-opacity="0.6"/></pattern>`)
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${this.height}" width="${WIDTH}" height="${this.height}">
  <title>${esc(this.title)}</title>
  <desc>${esc(this.description)}</desc>
${defs.length > 0 ? `  <defs>${defs.join('')}</defs>\n` : ''}  <rect width="${WIDTH}" height="${this.height}" fill="${PAPER}"/>
${this.body.map((line) => `  ${line}`).join('\n')}
</svg>
`
  }
}

/** The cells of a slot's colour in a drawn figure (a page, a block, a piece): the marks drawn with kind `cell`, hollow or filled. */
export function cells(svg: string, slot: Slot): number {
  return (svg.match(new RegExp(`<g class="cell( hollow)?" data-slot="${slot}">`, 'g')) ?? []).length
}
