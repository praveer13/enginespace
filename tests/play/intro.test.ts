/*
 * R-T08, the first run (REDESIGN §2.6, §3.5): the kit's order of steps for a session that asks first and one that does not, the pool's
 * order and its guess, the pointed first move against the reference run, the parts a level calls out against the intro flag, and the
 * dock's hold on the guess until the parts have been named. e2e/pool.spec.ts holds the same first run in a browser.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { applyAction, startRun, type GameAction, type Run, type Session } from '@es/play'
import { POOL } from '@es/play/pool/entry'
import { FIRST_MOVE_WORDS, lookLine, moveWords } from '@es/play/pool/copy'
import { poolGhost, poolInit, poolSession } from '@es/play/pool/session'
import type { PoolAction, PoolLevelId } from '@es/play/pool/types'
import {
  askShown,
  introAct,
  introAfter,
  introOpens,
  introParts,
  introPlan,
  introRing,
  introSteps,
  keepShown,
  MAX_CALLOUTS,
  partsInOrder,
  readShown,
} from '@/games/kit/first-move'
import { PLACE_KEYS } from '@/settings/store'
import { Controls } from '@/games/pool/Controls'
import { dumpOf } from '@/games/pool/dump'
import { partRows, poolKit } from '@/games/pool/kit'
import { fakeRun, practiceOf } from './pool-support'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Two stub sessions: one with no first ask, one that needs its prediction first                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

type StubAction = { t: 'go' } | { t: 'predict'; n: number }
interface StubState {
  readonly moves: number
  readonly predicted: number | null
}

/** A session of two moves. With `predictFirst`, its first ask is a prediction, and no move is legal before it. */
function stub(predictFirst: boolean): Session<string, StubState, StubAction, StubState, number, string> {
  return {
    level: (id) => id,
    inBand: () => true,
    init: () => ({ moves: 0, predicted: null }),
    ask: (s) => (predictFirst && s.predicted === null ? 'predict' : 'go'),
    reduce: (s, a) => {
      if (a.t === 'predict') return { ...s, predicted: a.n }
      if (predictFirst && s.predicted === null) throw new RangeError('the prediction comes first')
      return { ...s, moves: s.moves + 1 }
    },
    view: (s) => s,
    done: (s) => s.moves >= 2,
    score: (s) => s.moves,
    ghost: () => ({ moves: 2, predicted: 0 }),
    grade: () => ({ score: 1, ok: true }),
    debrief: () => ({ sentence: '', names: null }) as never,
  }
}

/** Walks a run through the kit's steps with Next, acting at each as the learner's intro does, and returns the run and the steps seen. */
function walk<S, A extends GameAction>(session: Session<string, S, A, S, number, string>, kit: { firstAsk: 'none' | 'required' | 'optional'; firstMove: A | null }, look: boolean) {
  let run: Run<S> = startRun(session, { game: 'stub', level: 'one', seed: 1 })
  const dispatch = (action: A) => {
    run = applyAction(session, run, action)
  }
  const steps = introSteps(kit.firstAsk, look)
  const log: { step: string; actions: number }[] = []
  for (let at: number | null = 0; at !== null; at = introAfter(steps, at, 'next')) {
    introAct(steps[at], kit, dispatch)
    log.push({ step: steps[at], actions: run.record.actions.length })
  }
  return { run, steps, log }
}

describe('the kit: look, or move', () => {
  test('a session with no first ask is offered a real move first, the reference run’s, and it is in the action log', () => {
    const { run, steps, log } = walk(stub(false), { firstAsk: 'none', firstMove: { t: 'go' } }, false)
    expect(steps).toEqual(['parts', 'move'])
    expect(log).toEqual([
      { step: 'parts', actions: 0 },
      { step: 'move', actions: 1 },
    ])
    expect(run.record.actions).toEqual([{ t: 'go' }])
    expect(introRing('move', { firstMove: { t: 'go' } })).toEqual({ t: 'go' })
  })

  test('a session that needs its prediction first gets an inspection, which dispatches nothing, and then the ask', () => {
    const { run, steps, log } = walk(stub(true), { firstAsk: 'required', firstMove: { t: 'go' } }, true)
    expect(steps).toEqual(['parts', 'look', 'ask', 'point'])
    expect(log.find((entry) => entry.step === 'look')).toEqual({ step: 'look', actions: 0 })
    expect(run.record.actions).toEqual([])
    // Nothing before the ask shows it, and the ring is on nothing until the ask is answered.
    expect(askShown('parts')).toBe(false)
    expect(askShown('look')).toBe(false)
    expect(askShown('ask')).toBe(true)
    expect(introRing('look', { firstMove: { t: 'go' } })).toBeNull()
  })

  test('the ask step moves on when the ask is answered; any real move ends the intro wherever it is', () => {
    const steps = introSteps('optional', true)
    expect(introAfter(steps, 2, { moved: false, askOpen: true })).toBe(2)
    expect(introAfter(steps, 2, { moved: false, askOpen: false })).toBe(3)
    expect(introAfter(steps, 0, { moved: true, askOpen: true })).toBeNull()
    expect(introAfter(steps, 3, 'next')).toBeNull()
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* KV page pool's first run                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const LEVELS = POOL.levels.map((level) => [level.id as PoolLevelId, level.practiceSeed] as const)

describe("KV page pool's first run", () => {
  test('the order is parts, look at request 1, the level’s own guess, then the first move pointed at', () => {
    const kit = poolKit('one-group', 2)
    const level = practiceOf('one-group')
    const view = poolSession.view(poolInit(level))
    expect(kit.firstAsk).toBe('optional')
    expect(introSteps(kit.firstAsk, kit.look?.(view) != null)).toEqual(['parts', 'look', 'ask', 'point'])
    const look = kit.look?.(view)
    expect(look?.label).toBe('Request 1')
    expect(look?.detail).toBe(lookLine(view.tickets[view.waiting[0]]))
    // The look names tokens and the prefix, never the page count the guess asks for.
    expect(String(look?.detail)).toMatch(/^\d+ tokens, conversation [A-Z], (no cached prefix|a cached prefix of \d+ tokens?)\.$/)
    expect(String(look?.detail)).not.toMatch(/page/)
    expect(kit.askWords?.(view)).toBe(view.predict.ask)
  })

  test('the guess is the session’s commit: nothing is dispatched before it, and it is the first action of the log', () => {
    const kit = poolKit('one-group', 2)
    let run = startRun(poolSession, { game: 'pool', level: 'one-group', seed: 2 })
    const dispatch = (action: PoolAction) => {
      run = applyAction(poolSession, run, action)
    }
    const steps = introSteps(kit.firstAsk, true)
    // The parts and the look: the intro acts at each, and nothing reaches the log.
    for (const step of steps.slice(0, 2)) introAct(step, kit, dispatch)
    expect(run.record.actions).toEqual([])
    // The ask: the learner commits, and the commit is the log's first action. It is the ask's own answer, so the intro moves on.
    const answer = practiceOf('one-group').predict.answer
    dispatch({ t: 'commit', prediction: answer })
    expect(run.record.actions).toEqual([{ t: 'commit', prediction: answer }])
    expect(kit.isAsk?.({ t: 'commit', prediction: answer })).toBe(true)
    const point = introAfter(steps, 2, { moved: false, askOpen: false })
    expect(point === null ? null : steps[point]).toBe('point')
    expect(introRing('point', kit)).toEqual(kit.firstMove)
    // The pointed first move is legal after the commit.
    dispatch(kit.firstMove as PoolAction)
    expect(run.record.actions[1]).toEqual(kit.firstMove as PoolAction)
  })

  test('Skip the guess dispatches nothing: the intro moves on to the first move with an empty log', () => {
    const kit = poolKit('one-group', 2)
    const run = startRun(poolSession, { game: 'pool', level: 'one-group', seed: 2 })
    const steps = introSteps(kit.firstAsk, true)
    for (const step of steps.slice(0, 3)) introAct(step, kit, () => {
      throw new Error('the intro dispatched before the guess')
    })
    // Skipping is the frame's own state (FrameRun.skipGuess), and the intro hears it as the ask closing.
    const after = introAfter(steps, 2, { moved: false, askOpen: false })
    expect(after === null ? null : steps[after]).toBe('point')
    expect(run.record.actions).toEqual([])
  })

  test.each(LEVELS)('the pointed first move of %s is the first action of its reference run, and its words come from the action kind', (id, seed) => {
    const kit = poolKit(id, seed)
    const ghost = poolGhost(poolSession.level(id, seed))
    expect(kit.firstMove).toEqual(ghost.history[0])
    expect(kit.firstMoveWords).toBe(moveWords(ghost.history[0]))
    expect(Object.keys(FIRST_MOVE_WORDS).sort()).toEqual(['admit', 'commit', 'evict', 'preempt', 'prefetch'])
  })

  test('each level lists the parts it draws, with where each is drawn, and the callouts are at most five', () => {
    for (const [id] of LEVELS) {
      const rows = partRows(id)
      expect(rows.length).toBeGreaterThanOrEqual(MAX_CALLOUTS)
      expect(introParts(rows, [], false).length).toBeLessThanOrEqual(MAX_CALLOUTS)
      expect(poolKit(id, 1).levelParts?.(id)).toEqual(rows.map((row) => row.id))
    }
    expect(introParts(partRows('one-group'), [], false).map((part) => part.id)).toEqual(['pool', 'page', 'waiting', 'batch', 'cost'])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The flag and the parts a level calls out                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the intro flag (es:intro) and the parts called out', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window')
  afterEach(() => {
    if (had === undefined) delete (globalThis as { window?: unknown }).window
    else Object.defineProperty(globalThis, 'window', had)
  })
  const withStorage = (blocked = false) => {
    const items = new Map<string, string>()
    const guard = () => {
      if (blocked) throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    const localStorage = {
      getItem: (key: string) => (guard(), items.get(key) ?? null),
      setItem: (key: string, value: string) => (guard(), void items.set(key, value)),
      removeItem: (key: string) => (guard(), void items.delete(key)),
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } })
    return items
  }

  test('a level whose parts were all shown does not open by itself; a level with one new part calls out only that one', () => {
    const rows = partRows('two-kinds')
    const met = rows.map((row) => row.id).filter((id) => id !== 'sliding')
    expect(introOpens(rows, rows.map((row) => row.id))).toBe(false)
    expect(introOpens(rows, met)).toBe(true)
    expect(introParts(rows, met, false).map((part) => part.id)).toEqual(['sliding'])
  })

  test('How to play replays the whole of it, the parts not met first, and a replay in the middle of a run names the parts only', () => {
    const rows = partRows('two-kinds')
    const met = rows.map((row) => row.id).filter((id) => id !== 'sliding')
    const replay = introPlan({ firstAsk: 'optional', canLook: true, parts: rows, shown: met, replay: true, ledger: true, turns: 0 })
    expect(replay?.parts.map((part) => part.id)).toEqual(['sliding', ...met])
    expect(replay?.steps).toEqual(['parts', 'look', 'ask', 'point'])
    expect(replay?.checking).toBe(false)
    expect(introPlan({ firstAsk: 'optional', canLook: true, parts: rows, shown: met, replay: true, ledger: true, turns: 4 })?.steps).toEqual(['parts'])
    expect(partsInOrder(rows, met)[0]).toMatchObject({ id: 'sliding', isNew: true })
  })

  test('on the front page only the flag is read; a page with a ledger waits for it before the intro shows', () => {
    const rows = partRows('one-group')
    expect(introPlan({ firstAsk: 'optional', canLook: true, parts: rows, shown: [], replay: false, ledger: false, turns: 0 })?.checking).toBe(false)
    expect(introPlan({ firstAsk: 'optional', canLook: true, parts: rows, shown: [], replay: false, ledger: true, turns: 0 })?.checking).toBe(true)
    expect(introPlan({ firstAsk: 'optional', canLook: true, parts: rows, shown: rows.map((row) => row.id), replay: false, ledger: true, turns: 0 })).toBeNull()
  })

  test('the flag keeps the part ids shown, per game, adds to them, and reads a broken or blocked key as none', () => {
    const items = withStorage()
    expect(readShown('pool')).toEqual([])
    keepShown('pool', ['pool', 'page'])
    keepShown('loop', ['queue'])
    keepShown('pool', ['page', 'cost'])
    expect(JSON.parse(items.get(PLACE_KEYS.intro) ?? 'null')).toEqual({ pool: ['pool', 'page', 'cost'], loop: ['queue'] })
    items.set(PLACE_KEYS.intro, '{not json')
    expect(readShown('pool')).toEqual([])
    items.set(PLACE_KEYS.intro, JSON.stringify({ pool: [1, 'page', null] }))
    expect(readShown('pool')).toEqual(['page'])
    withStorage(true)
    expect(readShown('pool')).toEqual([])
    expect(() => keepShown('pool', ['pool'])).not.toThrow()
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The dock under the intro                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the dock while the intro names the parts', () => {
  const level = practiceOf('one-group')
  const state = poolInit(level)
  const dock = (over: Parameters<typeof fakeRun>[1]) => {
    const run = fakeRun(state, over)
    return renderToStaticMarkup(h(Controls, { run, dump: dumpOf(run.view, null, () => undefined), mode: 'practice', onPoint: () => undefined }))
  }

  test('no prediction is shown before the parts list; a waiting row shows its tokens and prefix and not its page count', () => {
    const held = dock({ intro: { askShown: false, ring: null } })
    expect(held).not.toContain('data-pool-predict')
    expect(held).toContain('tokens')
    expect(held).toContain('prefix hit')
    expect(held).not.toContain('new page')
    const asked = dock({ intro: { askShown: true, ring: null } })
    expect(asked).toContain('data-pool-predict')
    expect(asked).not.toContain('new page')
  })

  test('a skipped guess is gone, and the rows show their page counts', () => {
    const skipped = dock({ guessSkipped: true })
    expect(skipped).not.toContain('data-pool-predict')
    expect(skipped).toContain('new page')
  })

  test('the amber ring is on the pointed first move, and on nothing else', () => {
    const kit = poolKit('one-group', level.seed)
    const markup = dock({ intro: { askShown: true, ring: kit.firstMove } })
    expect(markup.match(/es-marker__ring/g)?.length).toBe(1)
    const req = (kit.firstMove as Extract<PoolAction, { t: 'admit' }>).req
    expect(markup).toMatch(new RegExp(`es-marker__ring"><button[^>]*aria-label="Admit request ${(req ?? 0) + 1},`))
    expect(dock({ intro: { askShown: true, ring: null } })).not.toContain('es-marker__ring')
  })
})
