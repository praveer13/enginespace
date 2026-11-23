/*
 * R-T08, the feedback kit (REDESIGN §2.6): named moments said once per level at the first time their rule occurs, the delta beside a value
 * that has itself changed, the learner's best per level read from the ledger's play events, the reference drawn as a hollow outline on the
 * same axis at the end of a run, the guess and the result on one number line, the line Run again points at, and reduced motion.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import type { LedgerEvent } from '@es/ledger'
import { POOL_MOMENTS } from '@es/play/pool/copy'
import { house } from '@es/play/pool/policy'
import { poolSession } from '@es/play/pool/session'
import type { PoolView } from '@es/play/pool/types'
import { bestOf, playedLevels } from '@/games/kit/best'
import { deltasOf, momentAt, type Named } from '@/games/kit/moments'
import { Versus } from '@/games/kit/Versus'
import { Debrief } from '@/games/pool/Debrief'
import { poolKit } from '@/games/pool/kit'
import { fakeRun, outcomeOf, playThrough, practiceOf } from './pool-support'

const repo = path.resolve(import.meta.dirname, '../..')
const render = (element: ReactElement) => renderToStaticMarkup(h(StaticRouter, { location: '/play/pool' }, element))

/** The moments a whole run names, in order, as the frame asks the table after each action: each id once. */
function namedOver(views: readonly PoolView[]): Named[] {
  const said = new Set<string>()
  const named: Named[] = []
  const moments = poolKit('one-group', 2).moments
  for (let i = 1; i < views.length; i++) {
    const moment = momentAt(moments, said, views[i - 1], views[i], i)
    if (moment === null) continue
    for (const id of moment.ids) said.add(id)
    named.push(moment)
  }
  return named
}

describe('named moments', () => {
  const { states } = playThrough(practiceOf('one-group'), house)
  const views = states.map((state) => poolSession.view(state))
  const named = namedOver(views)

  test('each is said once in a level, at the first action where its rule occurs', () => {
    const ids = named.flatMap((moment) => moment.ids)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(POOL_MOMENTS.map((moment) => moment.id).sort())
    for (const moment of named)
      for (const id of moment.ids) {
        const rule = POOL_MOMENTS.find((entry) => entry.id === id)
        expect(rule?.line(views[moment.turn - 1], views[moment.turn])).not.toBeNull()
        // No earlier action set the rule off.
        for (let i = 1; i < moment.turn; i++) expect(rule?.line(views[i - 1], views[i])).toBeNull()
      }
  })

  test('the first admission names the pages it took, in the view’s own figures, beside the request', () => {
    const first = named[0]
    expect(first.id).toBe('pages-held')
    const before = views[first.turn - 1]
    const after = views[first.turn]
    const id = after.running.find((req) => !before.running.includes(req)) as number
    const ticket = after.tickets[id]
    const held = ticket.ruler.flat().filter((seg) => seg !== 'let-go').length
    expect(first.line).toBe(`Request ${id + 1} took ${held} pages: ${ticket.tokens} tokens at ${after.blockTokens} a page, in 1 KV group.`)
    expect(held).toBe(Math.ceil(ticket.tokens / after.blockTokens))
    expect(first.anchor).toBe(`[data-pool-batch] [data-req="${id}"]`)
  })

  test('a prefix hit is named when a request first reuses cached pages, and its count is the pages the hit supplied', () => {
    const hit = named.find((moment) => moment.ids.includes('prefix-hit'))
    expect(hit).toBeDefined()
    expect(hit?.line).toMatch(/^A prefix hit: request \d+ starts from \d+ cached tokens? \(\d+ cached pages?\) and computes nothing for them\.$/)
  })

  test('nothing is named on an action that changes nothing the rules read', () => {
    expect(momentAt(poolKit('one-group', 2).moments, new Set(), views[0], views[0], 1)).toBeNull()
  })
})

describe('the delta', () => {
  test('only a value that has itself changed gets one, as a signed difference', () => {
    expect(deltasOf({ served: 0, hit: 0, recomputed: 0 }, { served: 1, hit: 0, recomputed: 96 })).toEqual({ served: 1, recomputed: 96 })
    expect(deltasOf({ served: 3 }, { served: 2 })).toEqual({ served: -1 })
    expect(deltasOf({ served: 3 }, { served: 3 })).toEqual({})
  })

  test('it shows for one second, and under reduced motion it does not fade', () => {
    const css = readFileSync(path.join(repo, 'src/design/parts.css'), 'utf8')
    expect(css).toMatch(/\.es-delta \{[^}]*animation: es-delta-out var\(--es-dur-step\) var\(--es-ease-settle\) calc\(var\(--es-dur-settle\) \+ var\(--es-dur-step\) \+ var\(--es-dur-quick\)\)/)
    expect(css).toMatch(/:root\[data-motion='reduce'\] \.es-delta \{\s*animation: none;/)
  })
})

describe('your best, from the ledger', () => {
  const play = (ref: string, score: number): LedgerEvent => ({ kind: 'play', ref, score, ok: score >= 0.95, provenance: 'practice', data: { actions: '[]', actionsSha256: '' } }) as unknown as LedgerEvent

  test('is the highest score of the level’s runs, and counts them; another level and another game do not count', () => {
    const events = [play('play:pool/one-group', 0.8), play('play:pool/one-group', 0.97), play('play:pool/evict', 1), play('play:loop/one-group', 1)]
    expect(bestOf(events, 'pool', 'one-group')).toEqual({ score: 0.97, runs: 2 })
    expect(bestOf(events, 'pool', 'two-kinds')).toBeNull()
    expect([...playedLevels(events, 'pool')].sort()).toEqual(['evict', 'one-group'])
  })

  test('a run left before its end is not a run: it is no best, no count, and no level played', () => {
    const left = { ...play('play:pool/two-kinds', 0), data: { actions: '[]', actionsSha256: '', left: '2026-11-20T09:00:00.000Z' } } as unknown as LedgerEvent
    const events = [play('play:pool/one-group', 0.8), { ...left, ref: 'play:pool/one-group' } as LedgerEvent, left]
    expect(bestOf(events, 'pool', 'one-group')).toEqual({ score: 0.8, runs: 1 })
    expect(bestOf(events, 'pool', 'two-kinds')).toBeNull()
    expect([...playedLevels(events, 'pool')]).toEqual(['one-group'])
  })
})

describe('the result', () => {
  test('the reference is drawn as a hollow outline under yours, on the same axis', () => {
    const markup = renderToStaticMarkup(
      h(Versus, {
        caption: 'Cost',
        rows: [
          { id: 'cost', label: 'Cost', mine: 120, reference: 60 },
          { id: 'hit', label: 'Hits', mine: 30, reference: 90 },
        ],
      }),
    )
    // One axis for every row: the largest value of either run is the full length.
    expect(markup).toContain('data-run="mine" style="--es-share:1"')
    expect(markup).toContain('data-run="reference" style="--es-share:0.5"')
    expect(markup).toContain('data-run="reference" style="--es-share:0.75"')
    expect(markup.indexOf('data-run="mine" style="--es-share:1"')).toBeLessThan(markup.indexOf('data-run="reference" style="--es-share:0.5"'))
    const css = readFileSync(path.join(repo, 'src/games/kit/versus.css'), 'utf8')
    expect(css).toMatch(/\.es-versus__bar\[data-run='reference'\] \{\s*border-style: dashed;\s*background: none;/)
  })

  const finished = (predicted: number | null) => {
    const { states } = playThrough(practiceOf('one-group'), house)
    const state = { ...states[states.length - 1], predicted }
    return render(h(Debrief, { run: fakeRun(state, { done: true }), outcome: outcomeOf(state), next: null, onNext: () => undefined }))
  }

  test('the guess and the result sit on one number line, the counts are drawn against the reference, and Run again says the difference', () => {
    const markup = finished(5)
    expect(markup.match(/class="es-numline"/g)?.length).toBe(1)
    expect(markup).toContain('data-kind="guess"')
    expect(markup).toContain('data-kind="result"')
    expect(markup).toContain('data-versus=""')
    expect(markup).toMatch(/<p id="([^"]+)" class="es-pool-debrief__again" data-run-again=""><strong>Run again:<\/strong> you matched the reference&#x27;s cost/)
    const id = /<p id="([^"]+)" class="es-pool-debrief__again"/.exec(markup)?.[1]
    expect(markup).toContain(`aria-describedby="${id}"`)
    // A page with no ledger (the front page, or this render) reads no best.
    expect(markup).not.toContain('Your best on this level')
  })
})

describe('reduced motion', () => {
  test('nothing in the intro or the moments pulses or animates; each is drawn at its end', () => {
    const intro = readFileSync(path.join(repo, 'src/games/kit/intro.css'), 'utf8')
    const frame = readFileSync(path.join(repo, 'src/games/kit/frame.css'), 'utf8')
    const rules = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules(intro)).not.toMatch(/infinite|pulse/)
    expect(rules(frame)).not.toMatch(/infinite|pulse/)
    expect(intro).toMatch(/:root\[data-motion='reduce'\] :is\(\.es-intro, \.es-intro-callouts__at\) \{\s*animation: none;/)
    expect(intro).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*:root:not\(\[data-motion='full'\]\) :is\(\.es-intro, \.es-intro-callouts__at\) \{\s*animation: none;/)
    expect(frame).toMatch(/:root\[data-motion='reduce'\] \.es-frame__moment \{\s*animation: none;/)
    // Every duration the intro and the moments use is a motion token, which is 0 under reduced motion.
    for (const css of [intro, frame]) for (const value of css.match(/animation: [^;]+/g) ?? []) expect(value).toMatch(/none|var\(--es-dur-/)
  })
})
