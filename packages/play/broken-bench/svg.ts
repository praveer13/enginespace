/**
 * A small SVG tree for the board's sheets (A§6.3, GAMES.md §11 "2D design"): `layout.ts` turns a view into marks, `sheetSvg` turns the
 * marks into this tree, and the tree is rendered as React elements by src/games/broken-bench/svg.tsx and as text by `svgMarkup`, which
 * the tests use to count marks and compare drawings.
 *
 * Attribute names are React's (camelCase), so the React side passes them as props and this side writes them as SVG does. The text
 * escaping is the one React's server renderer uses.
 */

export type SvgValue = string | number

export interface SvgNode {
  readonly tag: string
  readonly attrs: Readonly<Record<string, SvgValue>>
  readonly children?: readonly (SvgNode | string)[]
}

/** The camelCase attributes the sheets use, which SVG writes in kebab-case. Any other camelCase name is a mistake. */
const KEBAB = [
  'strokeWidth',
  'strokeDasharray',
  'strokeLinecap',
  'strokeLinejoin',
  'textAnchor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fillOpacity',
  'strokeOpacity',
  'dominantBaseline',
  'pointerEvents',
]
/** Attributes that are camelCase in SVG itself. */
const NATIVE_CAMEL = ['viewBox', 'preserveAspectRatio', 'stdDeviation']

const attributeName = (name: string): string => {
  if (name === 'className') return 'class'
  if (KEBAB.includes(name)) return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
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

/** A number written the way it is printed in a drawing: at most two decimals, no trailing zeros. */
export const num = (value: number): number => Math.round(value * 100) / 100
