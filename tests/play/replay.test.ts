/*
 * W0-T14 acceptance check 2: replaying a recorded log regrades to the same score, and an edited stored score is ignored.
 *
 * The toy game (support.ts) plays seeded runs through the pure reducer into a log, and the replay grader regrades the log from
 * nothing. The laws, over 200 seeds, are that a replayed run equals the live one, that the grade does not depend on anything stored
 * beside the log, and that a log which does not replay (an illegal action, an action after the end, a log that stops short)
 * earns nothing and says where it broke.
 */
import { describe, expect, test } from 'bun:test'
import { below, rngFor, splitmix32u } from '@es/sim/core'
import { parseRef, refSchema } from '@es/schema/refs'
import { seededIds, stampEvent } from '@es/ledger'
import type { PlayEvent } from '@es/ledger'
import {
  applyAction,
  MAX_DRAWS,
  createRegistry,
  decodeActions,
  drawInBand,
  encodeActions,
  finishRun,
  playRef,
  regrade,
  regradeStored,
  replay,
  startRun,
  stateHash,
  storedRunOf,
  undoAction,
} from '@es/play'
import type { AnySession, GameAction, StoredRun } from '@es/play'
import { SEED_COUNT, seeds } from '../seeds'
import { PRACTICE_SEED, TOY, toySession, type ToyAction } from './support'

const BEGIN = { game: 'toy', level: 'pile', seed: PRACTICE_SEED } as const

/** An action of the toy, typed as the framework sees any action. */
const add = (n: number): GameAction => ({ t: 'add', n }) as GameAction

/** A run on `seed` that picks each move from a seeded stream, so a seed names the run. Returns the live run and its log. */
function randomRun(seed: number) {
  const pick = rngFor(seed, 'replay-test/moves')
  let run = startRun(toySession, { game: 'toy', level: 'pile', seed })
  while (!toySession.done(run.state)) run = applyAction(toySession, run, { t: 'add', n: 1 + below(pick, 3) })
  return run
}

describe('a recorded log regrades to the same score', () => {
  test(`over ${SEED_COUNT} seeds the replay equals the live run: state, grade, debrief and hash`, () => {
    for (const seed of seeds()) {
      const live = randomRun(seed)
      const finished = finishRun(toySession, live)
      expect(finished).not.toBeNull()
      const replayed = regrade(toySession, live.record)
      expect(replayed.valid).toBe(true)
      if (!replayed.valid || !finished) continue
      expect(replayed.grade).toEqual(finished.grade)
      expect(replayed.debrief).toEqual(finished.debrief)
      expect(replayed.hash).toBe(finished.hash)
      expect(replayed.hash).toBe(stateHash(live.state))
      expect(replayed.storedMatches).toBeNull()
    }
  })

  test('the log survives its text form: encode, decode, regrade', () => {
    for (let seed = 0; seed < 50; seed++) {
      const live = randomRun(seed)
      const decoded = decodeActions(encodeActions(live.record.actions))
      expect(decoded).toEqual([...live.record.actions])
      expect(regrade(toySession, { ...live.record, actions: decoded ?? [] })).toEqual(regrade(toySession, live.record))
    }
  })

  test('a known run grades as the rules say: the reference scores 1, and moves one at a time score ceil(target ÷ 3) ÷ target', () => {
    const target = toySession.level('pile', PRACTICE_SEED).target
    const reference = { ...BEGIN, actions: movesFor(target, (left) => Math.min(3, left)) }
    const slow = { ...BEGIN, actions: movesFor(target, () => 1) }
    const best = regrade(toySession, reference)
    const worst = regrade(toySession, slow)
    expect(best.valid && best.grade).toEqual({ score: 1, ok: true })
    expect(worst.valid && worst.grade.score).toBe(Math.ceil(target / 3) / target)
    expect(worst.valid && worst.grade.ok).toBe(false)
  })

  test('an overshoot ends the run and scores 0', () => {
    const seed = seedWithTarget(4)
    const graded = regrade(toySession, { game: 'toy', level: 'pile', seed, actions: movesFor(4, () => 3) })
    expect(graded.valid && graded.grade).toEqual({ score: 0, ok: false })
  })
})

/** The toy's moves for a target: `policy(left)` is what to add when `left` remains. */
function movesFor(target: number, policy: (left: number) => number): ToyAction[] {
  const actions: ToyAction[] = []
  for (let total = 0; total < target; ) {
    const n = policy(target - total)
    actions.push({ t: 'add', n })
    total += n
  }
  return actions
}

/** The first seed whose level asks for `target`. */
function seedWithTarget(target: number): number {
  for (let seed = 0; ; seed++) if (toySession.level('pile', seed).target === target) return seed
}

/** The first seeded run that is neither perfect nor an overshoot, so that a forged score of 1 is plainly a lie. */
function middlingRun() {
  for (let seed = 0; ; seed++) {
    const run = randomRun(seed)
    const score = finishRun(toySession, run)?.grade.score ?? 0
    if (score > 0 && score < 1) return run
  }
}

describe('an edited stored score is ignored', () => {
  const live = middlingRun()
  const truth = regrade(toySession, live.record)

  test('the replay is the grade, whatever score and ok are stored beside the log', () => {
    expect(truth.valid && truth.grade.score).toBeLessThan(1)
    const edits: Partial<StoredRun>[] = [{ score: 1, ok: true }, { score: 0 }, { ok: true }, { score: 0.5, ok: false }, { score: -3 }, { score: Number.NaN }, { score: 1e9 }]
    for (const edit of edits) {
      const graded = regrade(toySession, { ...live.record, ...edit })
      expect(graded.valid).toBe(true)
      if (!graded.valid || !truth.valid) continue
      expect(graded.grade).toEqual(truth.grade)
      expect(graded.hash).toBe(truth.hash)
      expect(graded.debrief).toEqual(truth.debrief)
    }
  })

  test('only storedMatches notices the edit: false for a forged score, true for the honest one, null when none is stored', () => {
    if (!truth.valid) throw new Error('the seeded run must grade')
    expect(regrade(toySession, { ...live.record, score: 1, ok: true })).toMatchObject({ valid: true, storedMatches: false })
    expect(regrade(toySession, { ...live.record, score: truth.grade.score, ok: truth.grade.ok })).toMatchObject({ valid: true, storedMatches: true })
    expect(regrade(toySession, { ...live.record, score: truth.grade.score })).toMatchObject({ valid: true, storedMatches: false })
    expect(regrade(toySession, live.record)).toMatchObject({ valid: true, storedMatches: null })
  })

  test('regradeStored finds the game by its id and ignores the stored score the same way', async () => {
    const registry = createRegistry([TOY])
    const forged = await regradeStored(registry, { ...live.record, score: 1, ok: true })
    expect(forged.valid && truth.valid && forged.grade).toEqual(truth.valid && truth.grade)
  })

  test('regradeStored refuses a game or a level this build does not have, and says which', async () => {
    const registry = createRegistry([TOY])
    expect(await regradeStored(registry, { ...live.record, game: 'nope' })).toMatchObject({ valid: false, reason: expect.stringContaining('no game "nope"') })
    expect(await regradeStored(registry, { ...live.record, level: 'nope' })).toMatchObject({ valid: false, reason: expect.stringContaining('no level "nope"') })
    expect(await regradeStored(createRegistry([]), live.record)).toMatchObject({ valid: false })
  })
})

describe('a log that does not replay earns nothing, and says where it broke', () => {
  const full = randomRun(11).record

  test('an illegal action names its place in the log', () => {
    const actions: GameAction[] = [...full.actions.slice(0, 1), add(9), ...full.actions.slice(1)]
    expect(regrade(toySession, { ...full, actions })).toMatchObject({ valid: false, at: 1, reason: expect.stringContaining('action 1 (add) is illegal') })
  })

  test('an action after the run was over is refused', () => {
    const actions = [...full.actions, { t: 'add', n: 1 }]
    expect(regrade(toySession, { ...full, actions })).toMatchObject({ valid: false, at: full.actions.length, reason: expect.stringContaining('after the run was over') })
  })

  test('a log that stops before the end has no grade', () => {
    const result = regrade(toySession, { ...full, actions: full.actions.slice(0, -1) })
    expect(result).toMatchObject({ valid: false, at: null, reason: expect.stringContaining('stops before the run is over') })
    expect(replay(toySession, { ...full, actions: [] })).toMatchObject({ ok: true, finished: false })
  })

  test('an action without a text kind, an unknown level and a bad seed are all refused, never thrown', () => {
    expect(regrade(toySession, { ...full, actions: [{ n: 1 } as unknown as GameAction] })).toMatchObject({ valid: false, at: 0, reason: expect.stringContaining('not an action') })
    expect(regrade(toySession, { ...full, level: 'nope' })).toMatchObject({ valid: false, at: null, reason: expect.stringContaining('the level cannot be built') })
    expect(regrade(toySession, { ...full, seed: -1 })).toMatchObject({ valid: false, at: null })
    expect(regrade(toySession, { ...full, seed: 2 ** 32 })).toMatchObject({ valid: false, at: null })
    expect(regrade(toySession, { ...full, seed: 1.5 })).toMatchObject({ valid: false, at: null })
  })

  test('a session that grades out of range, or throws while grading, earns nothing and does not crash the page', () => {
    const outOfRange: AnySession = { ...toySession, grade: () => ({ score: 2, ok: true }) }
    expect(regrade(outOfRange, full)).toMatchObject({ valid: false, reason: expect.stringContaining('[0, 1]') })
    const throws: AnySession = {
      ...toySession,
      ghost: () => {
        throw new Error('the reference broke')
      },
    }
    expect(regrade(throws, full)).toMatchObject({ valid: false, reason: expect.stringContaining('the reference broke') })
  })
})

describe('playing a run', () => {
  test('startRun builds the level and an empty log; applyAction appends and leaves the old run alone', () => {
    const start = startRun(toySession, { ...BEGIN, rev: 'abc123' })
    expect(start.record).toEqual({ ...BEGIN, actions: [], rev: 'abc123' })
    const next = applyAction(toySession, start, { t: 'add', n: 2 })
    expect(next.record.actions).toEqual([{ t: 'add', n: 2 }])
    expect(start.record.actions).toEqual([])
    expect(next.state.total).toBe(2)
    expect(start.state.total).toBe(0)
  })

  test('a run without a rev has no rev key, so its canonical form is the same everywhere', () => {
    expect('rev' in startRun(toySession, BEGIN).record).toBe(false)
  })

  test('a run that is over takes no more actions, and an illegal action throws without changing the run', () => {
    const live = randomRun(3)
    expect(() => applyAction(toySession, live, { t: 'add', n: 1 })).toThrow('the run is over')
    const start = startRun(toySession, BEGIN)
    expect(() => applyAction(toySession, start, { t: 'add', n: 7 })).toThrow('add 1, 2 or 3')
    expect(start.record.actions).toEqual([])
  })

  test('an action with no canonical JSON form is refused before it can reach the log', () => {
    const start = startRun(toySession, BEGIN)
    expect(() => applyAction(toySession, start, { t: 'add', n: Number.NaN })).toThrow()
    expect(() => applyAction(toySession, start, { t: 'add', n: 1, extra: undefined } as ToyAction)).toThrow('undefined has no JSON form')
  })

  test('the reducer receives the logged copy, so a later edit of the caller\'s object cannot reach the log', () => {
    const action = { t: 'add' as const, n: 1 }
    const run = applyAction(toySession, startRun(toySession, BEGIN), action)
    action.n = 3
    expect(run.record.actions).toEqual([{ t: 'add', n: 1 }])
  })

  test('undo is a replay of the log without its last action', () => {
    for (let seed = 0; seed < 50; seed++) {
      const live = randomRun(seed)
      const undone = undoAction(toySession, live)
      const expected = replay(toySession, { ...live.record, actions: live.record.actions.slice(0, -1) })
      expect(expected.ok).toBe(true)
      expect(undone.record.actions).toEqual(live.record.actions.slice(0, -1))
      expect(expected.ok && stateHash(expected.state)).toBe(stateHash(undone.state))
      expect(toySession.done(undone.state)).toBe(false)
    }
    const start = startRun(toySession, BEGIN)
    expect(undoAction(toySession, start)).toBe(start)
  })

  test('finishRun is null until the run is over, and then runs the reference', () => {
    const start = startRun(toySession, BEGIN)
    expect(finishRun(toySession, start)).toBeNull()
    const finished = finishRun(toySession, randomRun(5))
    if (finished === null) throw new Error('a run that is over must finish')
    expect(finished.ghost.taken.length).toBe(Math.ceil(finished.ghost.target / 3))
    expect(finished.ghost.total).toBe(finished.ghost.target)
  })

  test('the reference is not asked for until the run is over', () => {
    let asked = 0
    const erased: AnySession = toySession
    const spy: AnySession = {
      ...toySession,
      ghost: (level) => {
        asked += 1
        return erased.ghost(level)
      },
    }
    let run = startRun(spy, BEGIN)
    expect(finishRun(spy, run)).toBeNull()
    run = applyAction(spy, run, add(1))
    expect(finishRun(spy, run)).toBeNull()
    expect(asked).toBe(0)
  })
})

describe('the log as text', () => {
  test('the same actions are the same text, whatever order their keys were written in', () => {
    expect(encodeActions([add(1)])).toBe('[{"n":1,"t":"add"}]')
    expect(encodeActions([{ n: 1, t: 'add' } as GameAction])).toBe(encodeActions([add(1)]))
    expect(encodeActions([])).toBe('[]')
  })

  test('decodeActions takes any formatting of a list of actions and refuses everything else', () => {
    expect(decodeActions('[ { "t": "add", "n": 2 } ]')).toEqual([{ t: 'add', n: 2 }])
    for (const bad of ['', 'nope', '{}', '"add"', '[1]', '[{"n":1}]', '[{"t":3}]', '[null]', '[[]]', '[{"t":"a","big":1e300}]']) {
      expect([bad, decodeActions(bad)]).toEqual([bad, null])
    }
  })

  test('a log\'s text round-trips through decode and encode unchanged', () => {
    const text = encodeActions(randomRun(9).record.actions)
    expect(encodeActions(decodeActions(text) ?? [])).toBe(text)
  })
})

describe('refs and hashes', () => {
  test('playRef is a ref that the ledger\'s grammar parses back into the game and level', () => {
    expect(playRef('loop', 'first-1-fill')).toBe('play:loop/first-1-fill')
    expect(parseRef(playRef('shape-shifter', 'fewest'))).toEqual({ kind: 'play', game: 'shape-shifter', level: 'fewest' })
  })

  test('a state hash is 8 hex digits, equal for equal states and different for different ones', () => {
    const a = randomRun(1).state
    expect(stateHash(a)).toMatch(/^[0-9a-f]{8}$/)
    expect(stateHash(a)).toBe(stateHash({ ...a, taken: [...a.taken] }))
    expect(stateHash(a)).not.toBe(stateHash({ ...a, total: a.total + 1 }))
    expect(stateHash({ b: 1, a: 2 })).toBe(stateHash({ a: 2, b: 1 }))
  })

  test('a state that has no canonical JSON form cannot be hashed: a Map, a NaN', () => {
    expect(() => stateHash(new Map())).toThrow()
    expect(() => stateHash({ x: Number.NaN })).toThrow()
  })
})

describe('determinism', () => {
  test('the same seed and the same actions give the same state hash every time', () => {
    for (const seed of seeds()) {
      const a = randomRun(seed)
      const b = randomRun(seed)
      expect(stateHash(b.state)).toBe(stateHash(a.state))
      expect(encodeActions(b.record.actions)).toBe(encodeActions(a.record.actions))
    }
  })

  test('the stored form of a record is a plain object that JSON carries without loss', () => {
    const record = randomRun(4).record
    const stored: StoredRun = JSON.parse(JSON.stringify({ ...record, score: 0.5, ok: false }))
    expect(regrade(toySession, stored).valid).toBe(true)
  })
})

describe('a stored play event is replayed from its log, whatever else it says', () => {
  const clock = { nowIso: () => '2026-11-04T09:00:00.000Z', tzOffsetMinutes: () => 0 }
  const context = { clock, newId: seededIds(4), dev: 'dev-1' }

  /** A real ledger `play` event for a run, as W0-T10's codec accepts it: the log as text, and the result the writer cached. */
  function eventOf(run: ReturnType<typeof randomRun>, over: { score?: number; ok?: boolean; rev?: string } = {}): PlayEvent {
    const graded = finishRun(toySession, run)
    if (graded === null) throw new Error('the run must be over')
    return stampEvent(context, {
      kind: 'play',
      ref: playRef(run.record.game, run.record.level),
      score: over.score ?? graded.grade.score,
      ok: over.ok ?? graded.grade.ok,
      provenance: 'practice',
      seed: run.record.seed,
      ...(over.rev === undefined ? {} : { rev: over.rev }),
      data: { actions: encodeActions(run.record.actions), actionsSha256: 'a'.repeat(64) },
    })
  }

  test('storedRunOf takes the game and level from the ref, the seed and rev from the envelope, and the log from the text', () => {
    const run = middlingRun()
    const stored = storedRunOf(eventOf(run, { rev: 'abc9def' }))
    expect(stored).toMatchObject({ game: 'toy', level: 'pile', seed: run.record.seed, rev: 'abc9def' })
    expect(stored?.actions).toEqual([...run.record.actions])
  })

  test('an event whose score was edited in the ledger regrades to the replay, over 50 runs', () => {
    for (let seed = 0; seed < 50; seed++) {
      const run = randomRun(seed)
      const honest = regrade(toySession, storedRunOf(eventOf(run)) ?? run.record)
      const forged = storedRunOf(eventOf(run, { score: 1, ok: true }))
      expect(forged).not.toBeNull()
      const result = regrade(toySession, forged as NonNullable<typeof forged>)
      expect(result.valid && honest.valid && result.grade).toEqual(honest.valid && honest.grade)
      expect(result.valid && result.storedMatches).toBe(honest.valid && honest.grade.score === 1)
    }
  })

  test('an event that cannot be replayed gives nothing: another kind of ref, a damaged log, no seed', () => {
    const event = eventOf(randomRun(2))
    expect(storedRunOf({ ...event, ref: 'item:gen/tr2.bubble-width/a' })).toBeNull()
    expect(storedRunOf({ ...event, ref: 'play:toy' })).toBeNull()
    expect(storedRunOf({ ...event, ref: 'play:Toy/pile' })).toBeNull()
    expect(storedRunOf({ ...event, data: { actions: '[{"n":1}]' } })).toBeNull()
    expect(storedRunOf({ ...event, data: { actions: 'not json' } })).toBeNull()
    const withoutSeed: Record<string, unknown> = { ...event }
    delete withoutSeed.seed
    expect(storedRunOf(withoutSeed as unknown as typeof event)).toBeNull()
  })

  test('the play ref this reads is exactly the one the ledger\'s grammar writes', () => {
    for (const [game, level] of [['loop', 'first-1-fill'], ['pool', 'evict'], ['a', 'b'], ['x1', '2y'], ['shape-shifter', 'fewest']]) {
      expect(refSchema.safeParse(playRef(game, level)).success).toBe(true)
      expect(storedRunOf({ ref: playRef(game, level), seed: 1, data: { actions: '[]' } })).toMatchObject({ game, level })
    }
    for (const ref of ['play:/x', 'play:x/', 'play:x/y/z', 'play:-x/y', 'play:x-/y', 'play:x--y/z', 'play:X/y', 'play: x/y', 'play:x/y ', 'item:x/y']) {
      expect([ref, refSchema.safeParse(ref).success && ref.startsWith('play:')]).toEqual([ref, false])
      expect([ref, storedRunOf({ ref, seed: 1, data: { actions: '[]' } })]).toEqual([ref, null])
    }
  })
})

describe('a graded seed is drawn in band from fresh entropy', () => {
  test('the entropy itself is the first candidate, so an in-band entropy is the seed', () => {
    for (let entropy = 0; entropy < 500; entropy++) {
      if (toySession.inBand('pile', entropy)) expect(drawInBand(toySession, 'pile', entropy)).toBe(entropy)
    }
  })

  test('a rejection moves to the next splitmix32 output of the entropy, and the same entropy always lands on the same seed', () => {
    let rejected = 0
    for (let entropy = 0; entropy < 500; entropy++) {
      if (toySession.inBand('pile', entropy)) continue
      rejected += 1
      const drawn = drawInBand(toySession, 'pile', entropy)
      expect(toySession.inBand('pile', drawn)).toBe(true)
      expect(drawInBand(toySession, 'pile', entropy)).toBe(drawn)
      const more = splitmix32u(entropy)
      let candidate = more()
      while (!toySession.inBand('pile', candidate)) candidate = more()
      expect(drawn).toBe(candidate)
    }
    expect(rejected).toBeGreaterThan(100)
  })

  test('an entropy near the ends of the range is valid, and one outside it is refused', () => {
    expect(toySession.inBand('pile', drawInBand(toySession, 'pile', 0))).toBe(true)
    expect(toySession.inBand('pile', drawInBand(toySession, 'pile', 2 ** 32 - 1))).toBe(true)
    expect(() => drawInBand(toySession, 'pile', -1)).toThrow('unsigned 32-bit')
    expect(() => drawInBand(toySession, 'pile', 2 ** 32)).toThrow('unsigned 32-bit')
  })

  test('a band that accepts nothing gives up after MAX_DRAWS candidates, and says so', () => {
    let tried = 0
    const never = { inBand: () => (tried += 1, false) }
    expect(() => drawInBand(never, 'pile', 7)).toThrow('no in-band seed for level "pile" in 256 draws')
    expect(tried).toBe(MAX_DRAWS)
  })

  test('the cap leaves a band at its 20% floor a chance of about 2e-25 of failing', () => {
    let chance = 1
    for (let i = 0; i < MAX_DRAWS; i++) chance *= 0.8
    expect(chance).toBeLessThan(2e-25)
    expect(chance).toBeGreaterThan(1e-25)
  })
})
