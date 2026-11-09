/*
 * What the content renderer decides, as pure functions (ARCHITECTURE §4, D-016, W0-T09). The components in this folder
 * only draw these answers, and tests/content/ exercises them without a browser: when a claim goes stale, which unit a
 * readout prints, where a prose block breaks into tickets, which id a heading gets, and which task builds a block whose
 * feature is not there yet.
 *
 * Nothing here touches the DOM, Vite or React, and nothing reads the clock: `today` is always a parameter.
 */
import type { Claim, CompiledBlock, CompiledCard, IndexLesson, IndexModule, ProseFlow, ProseInline } from '@es/schema'
import type { ReadoutUnit } from '@/design/components/Readout'

/* ------------------------------------------------------------------------------------------------------------------ */
/* What every component of the renderer is handed                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface RenderEnv {
  /** The claims by id. `null` while they load, or when they could not be loaded. */
  claims: ReadonlyMap<string, Claim> | null
  /** Today as YYYY-MM-DD, for "stale since". */
  today: string
  /** The id of each heading node of the page (the node itself is the key), so that a link to `#why` finds it. */
  headings: ReadonlyMap<object, string>
}

/** The environment for a page: the claims and the day, and an id for every heading in `blocks`. */
export function renderEnv(blocks: readonly CompiledBlock[], claims: ReadonlyMap<string, Claim> | null, today: string): RenderEnv {
  return { claims, today, headings: headingIds(blocks) }
}

/** A page's `<title>`: its name, then the site's, as routes.tsx writes every route's. */
export const titled = (page: string): string => `${page} · enginespace`

/** Today as YYYY-MM-DD in UTC, the grain a claim's age is counted in. */
export const todayIso = (now: Date = new Date()): string => now.toISOString().slice(0, 10)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Claims                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const DAY = 86_400_000
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY
const isoOf = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10)

/**
 * The day a claim stopped being fresh, or null while it is fresh. A claim is good for `ttlDays` days after `verifiedAt`
 * (ARCHITECTURE §4.4). It is stale from the day after that, and "stale since" names the last good day, which is the date
 * `verify:claims` prints for the same claim: the two read one rule, and tests/content/claim-chip.test.ts holds them to it.
 */
export function staleSince(claim: Pick<Claim, 'verifiedAt' | 'ttlDays'>, today: string): string | null {
  const lastGood = dayNumber(claim.verifiedAt) + claim.ttlDays
  return lastGood < dayNumber(today) ? isoOf(lastGood) : null
}

/**
 * The units a claim writes in plain ASCII (`us`), as the readout prints them. A unit that is not here is printed as the
 * claim writes it, beside the number. `ticks` is left out on purpose: a readout prints ticks only when they are synthetic,
 * and a claim's unit does not say that.
 */
const READOUT_UNITS: Readonly<Record<string, Exclude<ReadoutUnit, 'ticks'>>> = {
  us: 'µs',
  µs: 'µs',
  ms: 'ms',
  ns: 'ns',
  s: 's',
  tokens: 'tokens',
  'tokens/s': 'tok/s',
  'tok/s': 'tok/s',
  requests: 'requests',
  steps: 'steps',
  pages: 'pages',
  slots: 'slots',
  stations: 'stations',
  '%': '%',
  B: 'B',
  KB: 'KB',
  MB: 'MB',
  GB: 'GB',
  x: 'x',
}

export const readoutUnit = (unit: string | undefined): Exclude<ReadoutUnit, 'ticks'> | undefined =>
  unit === undefined ? undefined : Object.hasOwn(READOUT_UNITS, unit) ? READOUT_UNITS[unit] : undefined

/** The digits after the point that a number is written with: 2.1 has one, 300 has none. */
export function decimals(value: number): number {
  const text = String(value)
  const exponent = /e-(\d+)$/.exec(text)
  const fraction = (text.split('e')[0].split('.')[1] ?? '').length
  return Math.min(6, fraction + (exponent === null ? 0 : Number(exponent[1])))
}

/** Every claim id that the prose of `blocks` cites, so that a page fetches the claims file only when it needs it. */
export function citedClaimIds(blocks: readonly CompiledBlock[]): ReadonlySet<string> {
  const ids = new Set<string>()
  const inline = (nodes: readonly ProseInline[]): void => {
    for (const node of nodes) {
      if (node.type === 'claim') ids.add(node.id)
      else if (node.type === 'em' || node.type === 'strong' || node.type === 'link') inline(node.children)
    }
  }
  const flow = (nodes: readonly ProseFlow[]): void => {
    for (const node of nodes) {
      if (node.type === 'paragraph' || node.type === 'heading') inline(node.children)
      else if (node.type === 'list') node.items.forEach(flow)
      else if (node.type === 'table') {
        node.head.forEach(inline)
        node.rows.forEach((row) => row.forEach(inline))
      }
    }
  }
  for (const block of blocks) if (block.type === 'prose') flow(block.body)
  return ids
}

/** Every claim id that a card's words cite, so that a card fetches the claims file only when it needs it. */
export function cardClaimIds(card: CompiledCard): ReadonlySet<string> {
  return citedClaimIds([{ type: 'prose', body: [...card.intro, ...card.models, ...card.ignores, ...card.calibrated] }])
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Prose: headings, sections and plain text                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export type HeadingFlow = Extract<ProseFlow, { type: 'heading' }>

/** The words of a line, without its marks: what a heading's id and a table's name are made from. */
export function plainText(nodes: readonly ProseInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text
        case 'em':
        case 'strong':
        case 'link':
          return plainText(node.children)
        case 'claim':
          return node.id
        case 'ks':
          return node.ref
        case 'tag':
          return ''
      }
    })
    .join('')
}

const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'

/**
 * An id for every heading in `blocks`, from its words: `## Why it matters` is `#why-it-matters`. A second heading with the
 * same words gets `-2`, and a third `-3`, so ids stay unique across the blocks of a page. The node is the key, and the map
 * is built in one pass over the page, so the ids do not depend on the order anything renders in.
 */
export function headingIds(blocks: readonly CompiledBlock[]): ReadonlyMap<object, string> {
  const ids = new Map<object, string>()
  const taken = new Set<string>()
  for (const block of blocks) {
    if (block.type !== 'prose') continue
    for (const node of block.body) {
      if (node.type !== 'heading') continue
      const base = slugOf(plainText(node.children))
      let id = base
      for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
      taken.add(id)
      ids.set(node, id)
    }
  }
  return ids
}

/** A stretch of prose under one heading. The first stretch has none when the prose opens before its first `##`. */
export interface Section {
  heading: HeadingFlow | null
  flows: ProseFlow[]
}

/**
 * Where a prose block breaks into tickets: before each level-2 heading, which becomes the stamped title of its ticket.
 * Deeper headings stay inside the ticket, and the page's own `h1` sits above every ticket, so the headings stay in order.
 */
export function sections(body: readonly ProseFlow[]): Section[] {
  const out: Section[] = []
  let current: Section = { heading: null, flows: [] }
  for (const flow of body) {
    if (flow.type === 'heading' && flow.depth === 2) {
      if (current.heading !== null || current.flows.length > 0) out.push(current)
      current = { heading: flow, flows: [] }
    } else current.flows.push(flow)
  }
  if (current.heading !== null || current.flows.length > 0) out.push(current)
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Links out to kernelspace                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * kernelspace's own site, where `ks:T5.L7` goes. Both facts are read from kernelspace at d478f91 (2026-10-30) with
 * `git show`, on 2026-11-04: its README says "Live: https://kernelspace.naigap.com", and its router has the route
 * `/lesson/:lessonId`, whose ids are lower case (`t5.l7`; `lessonById` lower-cases a lookup too). The site is the link's
 * target and the page makes no request to it. The owner may point it elsewhere.
 */
export const KERNELSPACE_ORIGIN = 'https://kernelspace.naigap.com'

/** `ks:T5.L7` to its lesson page on kernelspace. A kernelspace KC (`ks:t5.kv-capacity`) has no page of its own there, so no link. */
export function kernelspaceUrl(ref: string): string | null {
  const lesson = /^ks:((?:T[0-7]|R)\.L[0-9]+)$/.exec(ref)
  return lesson === null ? null : `${KERNELSPACE_ORIGIN}/lesson/${lesson[1].toLowerCase()}`
}

/** What a kernelspace ref reads as on the page: `kernelspace T5.L7`. */
export const kernelspaceLabel = (ref: string): string => `kernelspace ${ref.replace(/^ks:/, '')}`

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lanes, lessons                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The three lanes of work (ARCHITECTURE §8.1), in words. */
export const LANE_NAMES: Readonly<Record<string, string>> = { B: 'browser', L: 'laptop', F: 'GPU' }

export const laneName = (lane: string): string => (Object.hasOwn(LANE_NAMES, lane) ? LANE_NAMES[lane] : lane)

/** The lessons before and after one, in the order the module lists them. */
export function neighbours(module: IndexModule | undefined, slug: string): { previous: IndexLesson | null; next: IndexLesson | null } {
  const lessons = module?.lessons ?? []
  const at = lessons.findIndex((lesson) => lesson.slug === slug)
  if (at < 0) return { previous: null, next: null }
  return { previous: lessons[at - 1] ?? null, next: lessons[at + 1] ?? null }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Blocks whose feature is not built yet                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A block that renders as a placeholder: what it will be, and the task that builds it (docs/TRACKER.md). */
export interface Pending {
  task: string
  what: string
}

/**
 * The task that builds each game's session, 2D view and mirror, which a `game` block embeds. `loop` is TR2's levels, the
 * first lesson that needs it. tests/content/pending.test.ts reads docs/TRACKER.md and fails when a task here is gone or no
 * longer names the game.
 */
export const GAME_TASKS: Readonly<Record<string, string>> = {
  loop: 'W1-T13',
  'engine-floor': 'W1-T17',
  pool: 'W1-T23',
  verifier: 'W1-T28',
  'broken-bench': 'W1-T33',
  'shape-shifter': 'W2-T14',
  'gap-hunt': 'W2-T20',
  dispatch: 'W2-T25',
  switchyard: 'W2-T30',
}

/** The framework every game sits in, for a game id that GAME_TASKS does not list. */
const GAME_FRAMEWORK = 'W0-T14'

/**
 * The task that builds each lab, which a `lab` block is the Build card of: the three forge labs (lane B), then the GPU and
 * local labs (lanes L and F). The same test holds it to the tracker and to the compiler's list of lab ids.
 */
export const LAB_TASKS: Readonly<Record<string, string>> = {
  'hybrid-kv': 'W1-T22',
  'rejection-sampler': 'W1-T27',
  'kv-publisher': 'W2-T29',
  'tr0.forward': 'W2-T16',
  'tr1.fork': 'W2-T34',
  'tr3.profile': 'W2-T23',
  'tr4.sweep': 'W2-T26',
  'tr5b.connector': 'W2-T32',
  'tr6.proposer': 'W2-T35',
  'tr7.reproduce': 'W2-T38',
  'tr8.replay': 'W2-T36',
  'capstone.pair': 'W3-T02',
}

/** The forge host, which every forge lab runs on, for a lab id that LAB_TASKS does not list. */
const LAB_FRAMEWORK = 'W1-T10'

/**
 * The task that builds each feature the blocks stand for. The tracker gives no task to a lesson's prediction box, so it is
 * W1-T13, whose levels open with a prediction and are the first to need one.
 */
export const PENDING = {
  predict: { task: 'W1-T13', what: 'the prediction box' },
  trace: { task: 'W1-T09', what: 'the trace viewer' },
  'in-production': { task: 'W1-T13', what: 'the In-production card' },
  'build-this': { task: 'W1-T13', what: 'the Build-this card' },
  change: { task: 'W3-T06', what: 'the change card' },
} as const satisfies Record<string, Pending>

/** The task for a game or a lab, by its id. The ids are the content's, so a name that is not an own key of the table falls back to the framework. */
export const pendingGame = (game: string): Pending => ({ task: Object.hasOwn(GAME_TASKS, game) ? GAME_TASKS[game] : GAME_FRAMEWORK, what: 'the game' })
export const pendingLab = (lab: string): Pending => ({ task: Object.hasOwn(LAB_TASKS, lab) ? LAB_TASKS[lab] : LAB_FRAMEWORK, what: 'the lab' })
