/*
 * A game's picture on the Play index: its poster, the first frame of its 2D view (ARCHITECTURE §6.11). The picture is the file that
 * scripts/posters.ts writes to public/posters/ and that the front page inlines in its document. The board fetches the file and draws
 * it as elements, so that it takes the look of the page through the custom properties it paints with.
 *
 * The board does not draw a poster from the game's layout code. The front page's first paint holds that code, and a second page that
 * imported it would split the front page's shared chunks and make them dearer (verify:bundle), where a file costs the front page
 * nothing and the board never imports a game's code. A game gives its poster here when it has one: its file is written by
 * scripts/posters.ts, and its size is the one in the file's `viewBox`, which tests/map/posters.test.ts holds to this table. A game
 * with none shows a bare pan in its well (Specials.tsx) and not a picture it does not have.
 */
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { publicUrl } from '@/content/load'

export interface PosterFile {
  /** The file under `public/posters/`. */
  readonly file: string
  /** The size of the drawing in the units of its `viewBox`. The well keeps this shape before the file has come, so nothing moves when it does. */
  readonly width: number
  readonly height: number
}

/** The poster of each game that has one, by id. Each game's task adds its own beside Service's, and its file to scripts/posters.ts. */
export const POSTERS: Readonly<Record<string, PosterFile>> = Object.freeze({
  loop: { file: 'loop-first-frame-landscape.svg', width: 720, height: 300 },
})

/** Whether a game has a poster to draw. Only a game's own id counts: a name such as `constructor` is not one. */
export const hasPoster = (id: string): boolean => Object.hasOwn(POSTERS, id)

/** A game's poster file, or undefined. */
export const posterOf = (id: string): PosterFile | undefined => (hasPoster(id) ? POSTERS[id] : undefined)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading a poster file                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface PosterNode {
  readonly tag: string
  readonly attrs: Readonly<Record<string, string>>
  readonly children: readonly (PosterNode | string)[]
}

/**
 * What a poster may hold. The posters are written by packages/play/loop/svg.ts: these elements, no whitespace between tags, an
 * element never self-closing, and the five characters that React escapes written as entities. A file with anything else in it is not
 * read, so a poster that was changed under the board draws nothing and is not trusted.
 */
const TAGS: ReadonlySet<string> = new Set(['svg', 'defs', 'filter', 'feGaussianBlur', 'g', 'rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'text', 'title', 'desc'])

/** An attribute is a lowercase word (`x1` is one), or words joined by hyphens, or one of the three that SVG itself writes in camel case. */
const ATTRIBUTE_NAME = /^(?:[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*|viewBox|stdDeviation|preserveAspectRatio)$/
/** No handler, no style, no link, whatever its spelling. */
const FORBIDDEN_NAME = /^(?:on|style$|href$|src$|xlink)/

const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" }
const unescapeText = (text: string): string | null => {
  if (/&(?!(?:amp|lt|gt|quot|#x27);)/.test(text)) return null
  return text.replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => ENTITIES[entity])
}

const OPENING = /<([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z][A-Za-z0-9-]*="[^"<>]*")*)>/y
const CLOSING = /<\/([A-Za-z][A-Za-z0-9]*)>/y
const ATTRIBUTE = /([A-Za-z][A-Za-z0-9-]*)="([^"]*)"/g

/** The tree of a poster file, or null when the file is not a poster this board reads. */
export function parsePoster(markup: string): PosterNode | null {
  const source = markup.trim()
  let at = 0
  const element = (): PosterNode | null => {
    OPENING.lastIndex = at
    const opening = OPENING.exec(source)
    if (opening === null || !TAGS.has(opening[1])) return null
    at = OPENING.lastIndex
    const attrs: Record<string, string> = {}
    for (const [, name, value] of opening[2].matchAll(ATTRIBUTE)) {
      const text = unescapeText(value)
      if (text === null || !ATTRIBUTE_NAME.test(name) || FORBIDDEN_NAME.test(name) || Object.hasOwn(attrs, name)) return null
      attrs[name] = text
    }
    const children: (PosterNode | string)[] = []
    while (at < source.length) {
      if (source.startsWith('</', at)) {
        CLOSING.lastIndex = at
        const closing = CLOSING.exec(source)
        if (closing === null || closing[1] !== opening[1]) return null
        at = CLOSING.lastIndex
        return { tag: opening[1], attrs, children }
      }
      if (source[at] === '<') {
        const child = element()
        if (child === null) return null
        children.push(child)
      } else {
        const end = source.indexOf('<', at)
        const text = end < 0 ? null : unescapeText(source.slice(at, end))
        if (text === null) return null
        children.push(text)
        at = end
      }
    }
    return null
  }
  const root = element()
  return root !== null && root.tag === 'svg' && at === source.length ? root : null
}

/** React's name for an attribute: `stroke-width` is `strokeWidth`, `class` is `className`, and data and ARIA attributes and SVG's own camel case stay as they are. */
const propName = (name: string): string => (name === 'class' ? 'className' : /^(?:data|aria)-/.test(name) ? name : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()))

/** The tree as React elements. React's static renderer writes back the markup that the tree was read from. */
export function posterElement(node: PosterNode, key?: number): ReactElement {
  const props: Record<string, string | number> = key === undefined ? {} : { key }
  for (const [name, value] of Object.entries(node.attrs)) props[propName(name)] = value
  return createElement(node.tag, props, ...node.children.map((child, at) => (typeof child === 'string' ? child : posterElement(child, at))))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Fetching one                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const loads = new Map<string, Promise<PosterNode | null>>()
const read = new Map<string, PosterNode>()

/** A poster that has been fetched already, so that a page that comes back to the board draws it in its first frame. */
export const posterRead = (file: string): PosterNode | null => read.get(file) ?? null

/** Forgets every poster that was fetched. Tests use it, because they share one page's memory. */
export function forgetPosters(): void {
  loads.clear()
  read.clear()
}

/**
 * A poster file from this site's own origin (`connect-src 'self'`, D-033), read once. It is null when the file is not there or is not a
 * poster, and that is not remembered, so the next page that asks tries again.
 */
export function loadPoster(file: string): Promise<PosterNode | null> {
  const known = loads.get(file)
  if (known !== undefined) return known
  const started = fetch(publicUrl(`posters/${file}`))
    .then((response) => (response.ok ? response.text() : null))
    .then((text) => (text === null ? null : parsePoster(text)))
    .catch(() => null)
    .then((tree) => {
      if (tree === null) loads.delete(file)
      else read.set(file, tree)
      return tree
    })
  loads.set(file, started)
  return started
}
