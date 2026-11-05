/*
 * W1-T07: the cards of the repo itself. One card for each world that W1 builds (WORLD §5, A§5.9): the step loop, a request's
 * lifecycle, the hybrid KV manager, speculation, the benchmark client and the trace. tests/content/cards.test.ts holds the compiler to
 * its rules on a fixture; this holds the six real cards to them, and says what each acceptance check of the task asks.
 *
 *   1. Every card cites claim ids.
 *   2. `verify:games` fails when a registered game's card is missing (tests/play/cards-gate.test.ts runs that, and here the roster of
 *      A§6.1 is held to the cards that its games will name).
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { CORE_SCHEMA, load } from 'js-yaml'
import { CARD_PARTS } from '@es/schema'
import type { Claim, CompiledCard, ProseFlow, ProseInline } from '@es/schema'
import { NotionalMachineView } from '@/content/render/Blocks'
import { cardClaimIds, renderEnv } from '@/content/render/model'
import { GAME_IDS } from '../../scripts/content/directives.ts'
import { splitCard, unsourcedRules } from '../../scripts/content/cards.ts'
import { CARD_IDS, compile, errors, output, read, report } from './support.ts'
import { parseContentFile } from '../../scripts/content/parse.ts'
import type { Diagnostic } from '../../scripts/content/parse.ts'

/**
 * The world each card describes, by its card id: the module of `packages/sim` that the card is about (A§5.2), the task that builds the
 * model, and whether that task has merged. A card of a model that is built says what the model does. One that is not says that it is the
 * specification the model is built to, and the task that lands the model rewrites it.
 */
const WORLDS: Record<string, { world: string; builtBy: string; built: boolean }> = {
  'trace-room-steploop': { world: 'steploop', builtBy: 'W0-T13', built: true },
  lifecycle: { world: 'lifecycle', builtBy: 'W1-T16', built: true },
  kv: { world: 'kv', builtBy: 'W1-T21', built: true },
  spec: { world: 'spec', builtBy: 'W1-T26', built: true },
  'trace-room-bench': { world: 'bench', builtBy: 'W1-T31', built: true },
  'trace-room-trace': { world: 'trace', builtBy: 'W1-T08', built: true },
}

/**
 * The card that each game of A§6.1 names (the registry's `card`, A§6.3), by the world its rule belongs to. Only `loop` is registered
 * so far. W1-T17, W1-T23, W1-T28 and W1-T33 register the next four with these ids, and W2 adds the games of the worlds that
 * W2 builds (`tensor`, `backends` and `tiers`) with their own cards.
 */
const GAME_CARDS: Record<string, string> = {
  loop: 'trace-room-steploop',
  'engine-floor': 'lifecycle',
  pool: 'kv',
  verifier: 'spec',
  'broken-bench': 'trace-room-bench',
  'gap-hunt': 'trace-room-trace',
}

/** The claims of one of the worlds' files, with its dates left as the strings they are written as. */
const claimsOf = (name: string): Claim[] => load(read(`content/claims/worlds/${name}.yaml`), { schema: CORE_SCHEMA }) as Claim[]

const compiled = compile()
const card = (id: string): CompiledCard => JSON.parse(output(compiled, `src/content/generated/cards/${id}.json`)) as CompiledCard
const claims: ReadonlyMap<string, Claim> = new Map((JSON.parse(output(compiled, 'public/claims.json')) as { claims: Claim[] }).claims.map((claim) => [claim.id, claim]))

/** Every claim id in a run of prose, in order. */
function claimsIn(flows: readonly ProseFlow[]): string[] {
  const found: string[] = []
  const inline = (nodes: readonly ProseInline[]): void => {
    for (const node of nodes) {
      if (node.type === 'claim') found.push(node.id)
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
  flow(flows)
  return found
}

describe('the cards of the repo compile', () => {
  test('without a diagnostic of any kind', () => {
    expect(report(compiled)).toBe('')
    expect(errors(compiled)).toEqual([])
  })

  test('and they are the six worlds of W1, each with the file name that the model it describes exports or will export', () => {
    expect([...CARD_IDS]).toEqual(Object.keys(WORLDS).sort())
  })

  test.each(Object.entries(WORLDS))('%s is the card of the world %s, built by %s', (id, { world }) => {
    const json = card(id)
    expect(json.id).toBe(id)
    expect(json.kind).toBe('notional-machine')
    expect(json.world).toBe(world)
    expect(['draft', 'review', 'live']).toContain(json.status)
  })
})

describe('check 1: every card cites claim ids', () => {
  test.each(Object.keys(WORLDS))('%s cites claims, each of which exists', (id) => {
    const json = card(id)
    const cited = [...json.intro, ...json.models, ...json.ignores, ...json.calibrated].flatMap((flow) => claimsIn([flow]))
    expect(cited.length).toBeGreaterThan(0)
    for (const claim of cited) expect([id, claim, claims.has(claim)]).toEqual([id, claim, true])
    // The renderer fetches the claims file for a card that cites any, and for none that does not.
    expect([...cardClaimIds(json)].sort()).toEqual([...new Set(cited)].sort())
  })

  test.each(Object.keys(WORLDS))('%s: each rule under Models names its source', (id) => {
    const source = read(`content/cards/${id}.md`)
    const parsed = parseContentFile(`content/cards/${id}.md`, source, [] as Diagnostic[])
    const models = splitCard(parsed?.segments.filter((segment) => segment.kind === 'prose') ?? []).find((chunk) => chunk.name === 'Models')
    expect(models).toBeDefined()
    const rules = unsourcedRules(models?.md ?? '', models?.firstLine ?? 1)
    expect(rules.lists).toBeGreaterThan(0)
    expect(rules.rules).toBeGreaterThan(2)
    expect(rules.unsourced).toEqual([])
  })

  test('the engines the rules follow are cited at their pins: a claim of a card that names a pin has its source at that version', () => {
    // A§4.4 and D-035 (proposed; O-4): an engine fact belongs to a pin and is cited at the pinned version, never at "latest".
    const pinned: Record<string, string> = { vllm: '/v0.33.0/', sglang: '/v0.5.23/' }
    const files = ['engines'].map((name) => claimsOf(name))
    for (const claim of files.flat()) {
      if (claim.pin === undefined) continue
      expect([claim.id, claim.source?.url.includes(pinned[claim.pin])]).toEqual([claim.id, true])
      // A tag, and not a branch: the link must still show the same lines in a year.
      expect(claim.source?.url).not.toMatch(/\/blob\/(main|master|HEAD)\//)
    }
  })

  test('every claim that the worlds file adds says how it is known, and a paper or a page does not name a pin', () => {
    const own = ['engines', 'references'].flatMap((name) => claimsOf(name))
    expect(own.length).toBeGreaterThan(8)
    for (const claim of own) {
      expect([claim.id, claim.tag]).toEqual([claim.id, 'measured'])
      expect(claim.source?.quote.length).toBeGreaterThan(8)
      expect(claim.source?.accessed).toBe(claim.verifiedAt)
    }
    for (const claim of (claimsOf('references'))) expect([claim.id, claim.pin]).toEqual([claim.id, undefined])
  })
})

describe('check 2: the games of the roster name the cards of their worlds', () => {
  test('every game of A§6.1 that a world W1 builds belongs to has a card', () => {
    for (const [game, id] of Object.entries(GAME_CARDS)) {
      expect([game, GAME_IDS.includes(game)]).toEqual([game, true])
      expect([game, CARD_IDS.includes(id)]).toEqual([game, true])
    }
  })

  test('and the games of W2\'s worlds are the ones that have none yet', () => {
    expect(GAME_IDS.filter((game) => !(game in GAME_CARDS)).sort()).toEqual(['dispatch', 'shape-shifter', 'switchyard'])
  })
})

describe('each card is drawn', () => {
  const env = renderEnv([], claims, '2026-11-04')

  test.each(Object.keys(WORLDS))('%s: a ticket with its three parts in order, a chip for each claim it cites, and no claim the page does not know', (id) => {
    const json = card(id)
    const html = renderToString(h(StaticRouter, { location: '/' }, h(NotionalMachineView, { card: json, env, scope: 'tr2.l1' }))).replaceAll('<!-- -->', '')
    const printed = [...html.matchAll(/data-part="\w+"><span class="es-tape"[^>]*><span class="es-tape__text">([^<]+)</g)].map((match) => match[1])
    expect(printed).toEqual([...CARD_PARTS])
    expect(html).toContain(`<p class="es-c-card__name">${json.title.replaceAll("'", '&#x27;')}</p>`)
    expect(html).not.toContain('no such claim')
    expect(html).not.toContain('the claims did not load')
    const drawn = new Set([...html.matchAll(/data-claim="([^"]+)"/g)].map((match) => match[1]))
    expect([...drawn].sort()).toEqual([...cardClaimIds(json)].sort())
  })
})

describe('the words of the cards', () => {
  test('say that the real engine is authoritative, and that a card is wrong where it disagrees', () => {
    for (const id of CARD_IDS) expect(read(`content/cards/${id}.md`)).toContain('The real engine is authoritative: when it disagrees with this card, the card is wrong.')
  })

  test('name the task that builds each model, and say whether the model is built or this card is its specification', () => {
    for (const [id, { builtBy, built }] of Object.entries(WORLDS)) {
      const text = read(`content/cards/${id}.md`)
      expect(text).toContain(builtBy)
      const specification = text.includes('this card is the specification that model is built to and checked against')
      expect([id, specification]).toEqual([id, !built])
      if (built && id !== 'trace-room-steploop') expect([id, text.includes(`built by ${builtBy}`)]).toEqual([id, true])
    }
  })
})
