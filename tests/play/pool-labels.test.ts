/*
 * W1-T23, the tape on a pan (GAMES.md §2.6: "its masking-tape label carries its hash and its group") and the dump a learner drafts.
 *
 * The sim's pages know a hash and a group and nothing of whose they are, as an engine's pages do. The game wrote the night, so it can say
 * whose block a pan holds: `C·5` is table C's block 5 counted from the head, `S1·2` a block that lies wholly inside the first standing order,
 * which several tables open with and so share. A learner reads a pan's owner off its tape; these tests hold the tape to the night.
 */
import { describe, expect, test } from 'bun:test'
import { dumpOf } from '@/games/pool/dump'
import { labelOf, labelsOf } from '@es/play/pool/labels'
import { house } from '@es/play/pool/policy'
import { poolSession } from '@es/play/pool/session'
import { POOL_LEVEL_IDS } from '@es/play/pool/types'
import type { PoolAsk } from '@es/play/pool/types'
import { kvChain, kvExtraKey } from '@es/sim/kv'
import { PRACTICE, playThrough, practiceOf } from './pool-support'

const S = poolSession

describe('the tape on a pan names whose block it holds', () => {
  test('every pan that holds a hash has a tape of the form `C·5` or `S1·2`, and a kit\'s pans say which kit', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const { states } = playThrough(level, house)
      for (const state of [states[Math.floor(states.length / 3)], states[Math.floor(states.length / 2)], states[states.length - 1]]) {
        const view = S.view(state)
        for (const pan of view.pans) {
          if (pan.state === 'free') expect(pan.tape).toBeNull()
          else if (pan.state === 'adapter') expect(pan.tape).toMatch(/^kit \d+$/)
          else if (pan.hash !== null) expect([id, pan.id, pan.tape]).toEqual([id, pan.id, expect.stringMatching(/^(S\d+|[A-Z])·\d+$/)])
        }
      }
    }
  })

  test('a block that lies wholly inside a standing order is the standing order\'s, whichever table asked for it, and the rest are the table\'s', () => {
    let standingBlocks = 0
    let tableBlocks = 0
    for (const id of POOL_LEVEL_IDS) {
      const level = practiceOf(id)
      for (const table of level.tables) {
        const last = level.reqs.filter((req) => req.table === table.id).at(-1)!
        const sequence = last.prompt.concat(last.out)
        for (const size of new Set(level.spec.groups.map((g) => g.blockTokens))) {
          const chain = kvChain(sequence, Math.floor(sequence.length / size), size, kvExtraKey(table.adapter))
          chain.forEach((hash, block) => {
            const label = labelOf(level, size, hash)
            expect(label).toBeDefined()
            const inside = table.standing !== null && (block + 1) * size <= table.standingLen
            if (inside) {
              // Another table may have named it first, but the name is a standing order's, not a table's.
              expect(label?.table).toBeNull()
              expect(label?.text).toMatch(/^S\d+·\d+$/)
              standingBlocks += 1
            } else {
              expect(label?.text).toMatch(/^(S\d+|[A-Z])·\d+$/)
              tableBlocks += 1
            }
            expect(label?.block).toBe(block)
          })
        }
      }
    }
    expect(standingBlocks).toBeGreaterThan(10)
    expect(tableBlocks).toBeGreaterThan(50)
  })

  test('two tables that open with one standing order hold one pan between them for its blocks, and the tape says so', () => {
    let shared = 0
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const { states } = playThrough(level, house)
      for (const state of states) {
        const view = S.view(state)
        for (const pan of view.pans) {
          if (pan.tape?.startsWith('S') && pan.holders.length > 1) {
            const standings = new Set(pan.holders.map((t) => level.tables[level.reqs[t].table].standing))
            expect(standings.size).toBe(1)
            expect(standings.has(null)).toBe(false)
            shared += 1
          }
        }
      }
    }
    expect(shared).toBeGreaterThan(0)
  })

  test('the catalogue is made once for a level, and a hash the night never makes has no label', () => {
    const level = practiceOf('two-kinds')
    expect(labelsOf(level)).toBe(labelsOf(level))
    expect(labelOf(level, 16, 123456789)).toBeUndefined()
    expect(labelsOf(level).size).toBeGreaterThan(20)
  })
})

describe('the dump a learner drafts is one action until it is confirmed (dump.ts)', () => {
  const level = practiceOf('evict')
  const { states } = playThrough(level, house)
  const state = states.find((s) => s.ask?.kind === 'evict')!
  const view = S.view(state)
  const ask = state.ask as Extract<PoolAsk, { kind: 'evict' }>
  const key = `${view.step}:${ask.for}:${ask.target}:${ask.need}:${ask.candidates.length}`

  test('starts as what the engine would dump, the rotation\'s next pans, and can be confirmed as it stands', () => {
    const dump = dumpOf(view, null, () => undefined)
    expect(dump.open).toBe(true)
    expect(dump.pages).toEqual(ask.candidates.slice(0, ask.need))
    expect(dump.ready).toBe(true)
    expect(dump.need).toBe(ask.need)
    for (const page of ask.candidates) expect(dump.isPicked(page)).toBe(ask.candidates.indexOf(page) < ask.need)
  })

  test('a toggle makes a draft of its own, which is confirmed only when exactly as many pans as are needed are chosen, all of them on offer', () => {
    let made: { key: string; pages: readonly number[] } | null = null
    const dump = dumpOf(view, null, (next) => {
      made = next
    })
    const dropped = ask.candidates[0]
    dump.toggle(dropped)
    expect(made).toEqual({ key, pages: ask.candidates.slice(1, ask.need) })
    const short = dumpOf(view, made, () => undefined)
    expect(short.ready).toBe(false)
    const extra = ask.candidates[ask.need]
    const mended = dumpOf(view, { key, pages: [...(made as unknown as { pages: number[] }).pages, extra] }, () => undefined)
    expect(mended.ready).toBe(true)
    expect(mended.isPicked(dropped)).toBe(false)
    expect(mended.isPicked(extra)).toBe(true)
  })

  test('a pan that is not on offer cannot be chosen, and "the rotation\'s next" starts the draft again', () => {
    let touched = false
    const dump = dumpOf(view, null, () => {
      touched = true
    })
    const offered = new Set(ask.candidates)
    const refused = view.pans.find((pan) => !offered.has(pan.id))!
    dump.toggle(refused.id)
    expect(touched).toBe(false)
    let reset: unknown = 'unset'
    dumpOf(view, { key, pages: [] }, (next) => {
      reset = next
    }).reset()
    expect(reset).toBeNull()
  })

  test('a draft made for another ask is not this ask\'s: the pans chosen are the engine\'s again', () => {
    const stale = dumpOf(view, { key: 'another ask', pages: ask.candidates.slice(-ask.need) }, () => undefined)
    expect(stale.pages).toEqual(ask.candidates.slice(0, ask.need))
  })

  test('when nothing is to be dumped it is closed and chooses nothing', () => {
    const admitting = states.find((s) => s.ask?.kind === 'admit')!
    const dump = dumpOf(S.view(admitting), { key, pages: [1, 2] }, () => undefined)
    expect([dump.open, dump.pages, dump.ready, dump.need]).toEqual([false, [], false, 0])
  })
})
