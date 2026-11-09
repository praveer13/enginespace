/*
 * W1b-T03: `tr1.request-state`, the exit item of TR1's fifth lesson on the states of a request, and of its seventh, after an abort. The tests
 * hold the family to the claims that say what each move does at vLLM v0.33.0, to the lifecycle model's own states, and to the keys that its
 * tickets print: the status after a move, the event that moves a request, the count of finished statuses, and the status after an abort.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { isFinished, MOVES, requestState, STATUSES } from '@es/play/items/families/tr1/request-state'
import type { Move, Status } from '@es/play/items/families/tr1/request-state'
import { ENGINES } from '@es/sim/lifecycle'
import { correctId, expectWellMade, KC_IDS, claim, shares } from './items-tr1-support.ts'
import { keyOf } from './items-support.ts'
import { FINISHED_STATUSES } from '../content/tr1-demos.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(400, 0x71a3)

const slug = (status: string): string => status.toLowerCase().replace(/_/g, '-')

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr1.request-state')).toBe(requestState)
    expect(FAMILIES).toContain(requestState)
    expect(familiesForKc('tr1.request-states')).toEqual([requestState])
    for (const kc of requestState.kcs) expect(KC_IDS.has(kc)).toBe(true)
    expect(offeredAt(requestState, 0).map((variant) => variant.id)).toEqual(['next'])
    expect(offeredAt(requestState, 1).map((variant) => variant.id)).toEqual(['next', 'moves', 'abort'])
    expect(offeredAt(requestState, 2).map((variant) => variant.id)).toEqual(['next', 'moves', 'count', 'abort'])
    expect(offeredAt(requestState, 3).map((variant) => variant.id)).toEqual(['next', 'count'])
  })
})

describe('the statuses are the pin\'s', () => {
  test('are the twelve of RequestStatus, in the order of the enum, and the six after PREEMPTED are finished', () => {
    expect(claim('vllm.request.states').value).toBe(12)
    expect(STATUSES).toHaveLength(12)
    for (const status of STATUSES.slice(0, 6)) expect(claim('vllm.request.states').text).toContain(status)
    expect(claim('vllm.request.finished-order').text).toContain('last six of the enum')
    expect(STATUSES.slice(6).every((status) => status.startsWith('FINISHED_'))).toBe(true)
    expect(STATUSES.slice(0, 6).some((status) => status.startsWith('FINISHED_'))).toBe(false)
    expect(STATUSES.filter(isFinished)).toEqual(STATUSES.slice(6))
    // The lesson's own list of the finished statuses, which its test holds to the model.
    expect(new Set(FINISHED_STATUSES)).toEqual(new Set(STATUSES.filter(isFinished)))
  })

  test('include one that nothing assigns, which is finished by the rule all the same', () => {
    expect(claim('vllm.request.ignored-unassigned').text).toContain('Nothing in the package assigns it')
    expect(isFinished('FINISHED_IGNORED')).toBe(true)
    expect(MOVES.some((move) => move.to === 'FINISHED_IGNORED')).toBe(false)
  })
})

describe('each move rests on claims that say it', () => {
  const TEXT: Record<string, readonly string[]> = {
    arrives: ['WAITING'],
    'arrives-grammar': ['WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR', 'not in WAITING'],
    'grammar-ready': ['promotes', 'WAITING'],
    'remote-start': ['WAITING_FOR_REMOTE_KVS'],
    'remote-done': ['WAITING', 'PREEMPTED'],
    'remote-done-preempted': ['WAITING', 'PREEMPTED'],
    admit: ['RUNNING'],
    'admit-preempted': ['RUNNING'],
    preempt: ['PREEMPTED', 'front of the waiting queue'],
    stop: ['FINISHED_STOPPED'],
    length: ['FINISHED_LENGTH_CAPPED'],
    repetition: ['FINISHED_REPETITION'],
    'grammar-error': ['FINISHED_ERROR'],
    'session-wait': ['WAITING_FOR_STREAMING_REQ'],
    abort: ['FINISHED_ABORTED', 'skips an id that is unknown or already finished'],
  }

  test('names claims of the pin that exist, and each says what the move does', () => {
    expect(MOVES.map((move) => move.id).sort()).toEqual(Object.keys(TEXT).sort())
    for (const move of MOVES) {
      expect(move.claims.length).toBeGreaterThan(0)
      const texts = move.claims.map((id) => claim(id).text)
      for (const id of move.claims) expect([move.id, id, (claim(id) as { pin?: string }).pin]).toEqual([move.id, id, 'vllm'])
      for (const words of TEXT[move.id]) expect([move.id, words, texts.some((text) => text.includes(words))]).toEqual([move.id, words, true])
    }
  })

  test('names the file and the definition that set the status, which the claims\' own sources are', () => {
    for (const move of MOVES) {
      const sources = move.claims.map((id) => claim(id).source)
      const last = move.where.symbol.split('.').at(-1) ?? ''
      const found = sources.some((source) => source !== undefined && source.url.includes(move.where.path) && source.title.includes(last))
      expect([move.id, found]).toEqual([move.id, true])
    }
  })

  test('start where the model\'s path puts a request: a new request is WAITING, it is RUNNING once scheduled, and an abort ends it FINISHED_ABORTED', () => {
    const stages = ENGINES.vllm.path({ engine: 'vllm', streaming: true, tp: 1, abort: true, prefixHit: false, n: 1 })
    const state = (id: string) => stages.find((stage) => stage.id === id)?.state
    expect(state('vllm.waiting-queue')).toBe(MOVES.find((move) => move.id === 'arrives')?.to)
    expect(state('vllm.schedule')).toBe(MOVES.find((move) => move.id === 'admit')?.to)
    expect(state('vllm.finish-aborted')).toBe(MOVES.find((move) => move.id === 'abort')?.to)
  })

  test('is a graph in which a finished status has no move out, and every move into a status leaves a status that is not finished', () => {
    for (const move of MOVES) {
      if (move.from !== 'new' && move.from !== 'unfinished') expect([move.id, isFinished(move.from)]).toEqual([move.id, false])
      if (move.from === 'unfinished') expect(move.to).toBe('FINISHED_ABORTED')
    }
  })
})

describe('every item', () => {
  test('is deterministic, well formed and graded as the key says, at every level, with no bare number in a sentence', () => {
    expectWellMade(requestState, SEEDS)
  })
})

describe('next', () => {
  const movesOf = (item: Item): Move[] => String(item.params.moves).split(',').map((id) => MOVES.find((move) => move.id === id) as Move)

  test('is the status the move leads to, with the status the request starts in as the ticket says it', () => {
    for (const level of [0, 1, 2] as const) {
      for (const seed of SEEDS.slice(0, 150)) {
        const item = requestState.make(seed, level, 'next')
        const [move] = movesOf(item)
        expect(correctId(item)).toBe(slug(move.to))
        const start = item.params.start as Status | 'new'
        if (start === 'new') expect(plain(item.stem)).toMatch(/^A new request arrives, and /)
        else expect(plain(item.stem)).toContain(`A request is in ${start}, and `)
        expect(plain(item.stem)).toContain(move.event)
        // The start is where the move begins, or any status that is not finished for an abort.
        if (move.from === 'unfinished') expect(isFinished(start as Status)).toBe(false)
        else expect(start).toBe(move.from)
      }
    }
  })

  test('is drawn answer first: each status a move leads to is the key about once in eleven', () => {
    const share = shares(requestState, 2, 'next', correctId)
    expect(share.size).toBe(11)
    expect(share.has('finished-ignored')).toBe(false)
    for (const [status, rate] of share) expect([status, rate > 0.05 && rate < 0.14]).toEqual([status, true])
  })

  test('at level 3 is two moves in a row, the first leading to where the second starts, and the key is where the second leads', () => {
    const chains = new Set<string>()
    for (const seed of SEEDS) {
      const item = requestState.make(seed, 3, 'next')
      const [first, second] = movesOf(item)
      expect(movesOf(item)).toHaveLength(2)
      expect(correctId(item)).toBe(slug(second.to))
      if (second.from === 'unfinished') expect(isFinished(first.to)).toBe(false)
      else expect(first.to).toBe(second.from)
      expect(first.from).not.toBe('unfinished')
      expect(plain(item.stem)).toContain(`First ${first.event}, and then ${second.event}.`)
      chains.add(`${first.id}>${second.id}`)
      // The end of a remote load leads to WAITING or PREEMPTED by the request's history, which a status does not hold: no chain ends in it.
      expect(['remote-done', 'remote-done-preempted']).not.toContain(second.id)
    }
    expect(chains.size).toBeGreaterThan(20)
  })

  test('never offers FINISHED_IGNORED as a lure where the key is a move\'s status, and offers it in an abort', () => {
    let inAbort = 0
    for (const seed of SEEDS) {
      for (const level of [0, 2, 3] as const) {
        const item = requestState.make(seed, level, 'next')
        if (item.answer.kind === 'choice') expect(item.answer.options.map((option) => option.id)).not.toContain('finished-ignored')
      }
      const abort = requestState.make(seed, 2, 'abort')
      if (abort.answer.kind === 'choice' && abort.answer.options.some((option) => option.id === 'finished-ignored')) inAbort += 1
    }
    expect(inAbort).toBeGreaterThan(20)
  })
})

describe('moves', () => {
  test('is the event of the move that takes the request from one status to the other, and no other option does', () => {
    for (const level of [1, 2] as const) {
      for (const seed of SEEDS.slice(0, 150)) {
        const item = requestState.make(seed, level, 'moves')
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        const move = MOVES.find((candidate) => candidate.id === correctId(item))
        expect(move).toBeDefined()
        const text = plain(item.stem)
        const start = item.params.from as string
        if (start === 'new') expect(text).toContain(`starts in ${move?.to}`)
        else expect(text).toContain(`from ${start} to ${move?.to}`)
        // No other option is a move between the same two statuses.
        for (const option of item.answer.options) {
          const other = MOVES.find((candidate) => candidate.id === option.id)
          expect(other).toBeDefined()
          if (option.id !== correctId(item)) {
            expect(other?.to === move?.to && (other?.from === start || (other?.from === 'unfinished' && start !== 'new' && !isFinished(start as Status)))).toBe(false)
          }
        }
      }
    }
  })

  test('offers five events with the move\'s id for each, and says what each wrong one does instead', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const item = requestState.make(seed, 2, 'moves')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(item.answer.options).toHaveLength(5)
      for (const option of item.answer.options) {
        if (option.id === item.answer.correct) continue
        expect(plain(option.why)).toMatch(/^That is what takes a request (?:that has just arrived|that is not finished|out of [A-Z_]+) to [A-Z_]+, and not what puts this one in [A-Z_]+\.$/)
        expect(option.miss).toBe(`tr1.request-state.${option.id}-for-${item.answer.correct}`)
      }
    }
  })
})

describe('count', () => {
  const statusesOf = (item: Item): Status[] => String(item.params.statuses).split(',') as Status[]

  test('is the number of finished statuses on the ticket, and at level 3 of those that are not', () => {
    for (const level of [2, 3] as const) {
      for (const seed of SEEDS.slice(0, 150)) {
        const item = requestState.make(seed, level, 'count')
        const statuses = statusesOf(item)
        const finished = statuses.filter(isFinished).length
        const key = item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN
        expect(statuses).toHaveLength(level === 3 ? 12 : 9)
        expect(key).toBe(level === 3 ? statuses.length - finished : finished)
        expect(plain([item.givens[0].value])).toBe(statuses.join(', '))
      }
    }
  })

  test('is drawn answer first: every count from none to all is the key about once in ten', () => {
    const counts = new Map<number, number>()
    for (const seed of fixedSeeds(1000, 0x1c0)) {
      const item = requestState.make(seed, 2, 'count')
      const key = item.answer.kind === 'numeric' ? item.answer.truth : -1
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const [key, n] of counts) expect([key, n > 60 && n < 140]).toEqual([key, true])
  })

  test('counts FINISHED_IGNORED as finished, and says so when it is on the ticket, and names the two mistakes that a wrong count shows', () => {
    let ignored = 0
    for (const seed of SEEDS) {
      const item = requestState.make(seed, 2, 'count')
      const statuses = statusesOf(item)
      const finished = statuses.filter(isFinished).length
      const left = statuses.filter((status) => status === 'FINISHED_IGNORED').length
      if (left > 0) {
        ignored += 1
        expect(plain(requestState.solution(item).map((step) => step.text).flat())).toContain('counts, though nothing in the package assigns it')
        const wrong = requestState.grade(item, { kind: 'numeric', value: finished - left })
        expect(wrong.diagnosis?.id).toBe('tr1.request-state.ignored-left-out')
      }
      const other = requestState.grade(item, { kind: 'numeric', value: statuses.length - finished })
      if (statuses.length - finished !== finished && !(left > 0 && statuses.length - finished === finished - left)) expect(other.diagnosis?.id).toBe('tr1.request-state.counted-the-other-side')
    }
    expect(ignored).toBeGreaterThan(100)
  })
})

describe('abort', () => {
  test('leaves a request that is not finished in FINISHED_ABORTED, and a request that is finished as it was, because finish_requests skips it', () => {
    expect(claim('vllm.scheduler.finish-requests').text).toContain('skips an id that is unknown or already finished')
    let finishedBefore = 0
    let notFinished = 0
    for (const seed of SEEDS) {
      const item = requestState.make(seed, 2, 'abort')
      const held = item.params.held as Status
      const key = item.answer.kind === 'choice' ? item.answer.correct : ''
      if (isFinished(held)) {
        finishedBefore += 1
        expect(key).toBe(slug(held))
        expect(held).not.toBe('FINISHED_ABORTED')
        expect(held).not.toBe('FINISHED_IGNORED')
      } else {
        notFinished += 1
        expect(key).toBe('finished-aborted')
      }
      if (item.answer.kind !== 'choice') continue
      const ids = item.answer.options.map((option) => option.id)
      // The request's own status and FINISHED_ABORTED are always among the options: the two lures of the two cases.
      expect(ids).toContain(slug(held))
      expect(ids).toContain('finished-aborted')
      expect(ids).toHaveLength(5)
    }
    expect(finishedBefore).toBeGreaterThan(notFinished * 2)
  })

  test('is drawn answer first: each of the five statuses it can leave is the key on a fifth of the seeds', () => {
    const share = shares(requestState, 2, 'abort', correctId)
    expect([...share.keys()].sort()).toEqual(['finished-aborted', 'finished-error', 'finished-length-capped', 'finished-repetition', 'finished-stopped'])
    for (const [status, rate] of share) expect([status, rate > 0.15 && rate < 0.25]).toEqual([status, true])
  })

  test('names the abort path\'s KC beside the states\'', () => {
    expect(requestState.variants.find((variant) => variant.id === 'abort')?.kcs).toEqual(['tr1.request-states', 'tr1.abort-path'])
    const item = requestState.make(SEEDS[0], 2, 'abort')
    expect(item.kcs).toEqual(['tr1.request-states', 'tr1.abort-path'])
    expect(requestState.grade(item, keyOf(item)).ok).toBe(true)
  })
})

describe('levels', () => {
  test('give a worked example at level 0, the first step at level 1, and nothing at levels 2 and 3', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      expect(requestState.make(seed, 0, 'next').worked.length).toBeGreaterThanOrEqual(2)
      for (const variant of offeredAt(requestState, 1)) expect(requestState.make(seed, 1, variant.id).worked).toHaveLength(1)
      for (const level of [2, 3] as const) for (const variant of offeredAt(requestState, level)) expect(requestState.make(seed, level, variant.id).worked).toHaveLength(0)
    }
    expect(LEVELS).toEqual([0, 1, 2, 3])
  })

  test('do not give the key away in the first step that level 1 shows', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const item = requestState.make(seed, 1, 'moves')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const right = item.answer.options.find((option) => option.id === item.answer.correct)
      expect(plain(item.worked[0].text)).not.toContain(plain(right?.text ?? []).toLowerCase())
    }
  })
})
