/**
 * Helpers for the map tests: the repository's own content compiled once, the pages drawn on the server renderer inside a router, and
 * readers for the markup. The content is the course as it stands, so these tests follow it as modules are written, and say what they
 * mean by reading it back.
 */
import { createElement as h, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import type { Claim, CompiledModule, ContentIndex, CourseMap } from '@es/schema'
import type { LedgerEvent } from '@es/ledger'
import { deriveProgress } from '@/progress/derive'
import type { Progress } from '@/progress/derive'
import { appSources, homeModule } from '@/progress/sources'
import { compile, output } from '../content/support.ts'

const compiled = compile()
const json = <T>(file: string): T => JSON.parse(output(compiled, file)) as T

export const INDEX = json<ContentIndex>('src/content/generated/index.json')
export const MAP = json<CourseMap>('src/content/generated/map.json')
export const TR2 = json<CompiledModule>('src/content/generated/modules/tr2.json')
export const CLAIMS: ReadonlyMap<string, Claim> = new Map(json<{ claims: Claim[] }>('public/claims.json').claims.map((claim) => [claim.id, claim]))
export const TODAY = '2026-11-04'

/** A page as the server renders it inside a router, with React's text-node markers taken out. */
export const render = (element: ReactElement, location = '/'): string => renderToString(h(StaticRouter, { location }, element)).replaceAll('<!-- -->', '')

/** What the app derives from a ledger of these events, over the compiled course. */
export const progressOf = (events: readonly LedgerEvent[]): Progress => deriveProgress(events, MAP, appSources(MAP), homeModule)

/** The opening tags of an element, from the markup. */
export const opening = (html: string, name: string): string[] => [...html.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>`, 'g'))].map((match) => match[0])
export const attribute = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

/** The markup of the element that begins with `start`, from its opening tag to its closing one: nested elements of the same tag are counted. */
export function elementFrom(html: string, start: string, tag: string): string {
  const at = html.indexOf(start)
  if (at < 0) throw new Error(`no element begins with ${start}`)
  let depth = 0
  for (const match of html.slice(at).matchAll(new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g'))) {
    depth += match[1] === '/' ? -1 : 1
    if (depth === 0) return html.slice(at, at + (match.index ?? 0) + match[0].length)
  }
  throw new Error(`the element that begins with ${start} never closes`)
}

/** The markup of the `li` that a module's stop is on the map. */
export const stopOf = (html: string, module: string): string => elementFrom(html, `<li class="es-map__stop" data-module="${module}"`, 'li')

/** The markup of the `li` that a game's line is on the Play index. */
export const lineOf = (html: string, game: string): string => elementFrom(html, `<li class="es-line" data-game="${game}"`, 'li')

/** The text of some markup: tags dropped, the entities that React writes read back, whitespace folded. */
export const textOf = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim()
