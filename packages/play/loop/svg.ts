/**
 * A small SVG tree and its two renderers' common ground (A§6.11, GAMES.md §3 "2D path").
 *
 * The 2D view and the poster are one drawing: `layout.ts` turns a view into marks, `frameSvg` turns the marks into this tree, and
 * the tree is rendered twice. The poster is its markup as text (`svgMarkup`, used by `scripts/posters.ts`), and the 2D view is the
 * same tree as React elements (src/games/loop/View2D.tsx). `tests/play/loop-layout.test.ts` requires the two to be byte for byte
 * the same, so the poster is the 2D view's first frame and cannot drift from it.
 *
 * Attribute names are React's (camelCase), so the React side passes them as props and this side writes them as SVG does. The text
 * escaping is the one React's server renderer uses, which is what makes the two outputs equal.
 */

export type SvgValue = string | number

export interface SvgNode {
  readonly tag: string
  readonly attrs: Readonly<Record<string, SvgValue>>
  readonly children?: readonly (SvgNode | string)[]
}

/** The camelCase attributes this drawing uses, and the SVG name each is written as. Any other camelCase name is a mistake. */
const ATTRIBUTES: Readonly<Record<string, string>> = {
  className: 'class',
  strokeWidth: 'stroke-width',
  strokeDasharray: 'stroke-dasharray',
  strokeLinecap: 'stroke-linecap',
  textAnchor: 'text-anchor',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  fillOpacity: 'fill-opacity',
  dominantBaseline: 'dominant-baseline',
}
/** Attributes that are camelCase in SVG itself. */
const NATIVE_CAMEL = ['viewBox', 'preserveAspectRatio']

const attributeName = (name: string): string => {
  const mapped = ATTRIBUTES[name]
  if (mapped !== undefined) return mapped
  if (/[A-Z]/.test(name) && !NATIVE_CAMEL.includes(name)) throw new Error(`the SVG attribute "${name}" has no kebab-case form in svg.ts`)
  return name
}

/** React's text and attribute escaping, so the markup here equals the server renderer's. */
export function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#x27;'))
}

/** The markup of a tree: no whitespace between tags, an element never self-closing, as React's static renderer writes it. */
export function svgMarkup(node: SvgNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => ` ${attributeName(name)}="${escapeText(String(value))}"`)
    .join('')
  const inner = (node.children ?? []).map((child) => (typeof child === 'string' ? escapeText(child) : svgMarkup(child))).join('')
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`
}

/** The elements that are marks on the page: everything that draws, and nothing that only groups. */
const DRAWN = ['rect', 'circle', 'line', 'path', 'polygon', 'text']

/** How many marks a tree draws (A§6.4: the 2D view stays at or under 2,000 SVG marks in its default window). */
export function countMarks(node: SvgNode): number {
  return (DRAWN.includes(node.tag) ? 1 : 0) + (node.children ?? []).reduce<number>((sum, child) => sum + (typeof child === 'string' ? 0 : countMarks(child)), 0)
}

/** A number written the way it is printed: at most two decimals, no trailing zeros. */
export const num = (value: number): number => Math.round(value * 100) / 100
