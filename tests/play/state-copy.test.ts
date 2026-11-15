/*
 * R-T02: display copy is not state. A game's state holds its level, and `stateHash` covers the whole state (packages/play/replay.ts), so a
 * word in a level moved the golden hashes when it was reworded although no rule changed. The words are in `packages/play/<game>/copy.ts`
 * by level id and stage id, and a view reads them there.
 *
 * This test walks the state of every level of every built game, at its start and at every state along its reference run, and finds no
 * string outside a closed list: the ids and enum values below, each named by the path it stands at. A string anywhere else is display
 * text (or an id this list does not know yet, which a reviewer adds on sight). It also holds the actions of the reference runs to ids and
 * numbers, so that no action carries an option's words, and holds each game's copy table to the levels the registry lists.
 */
import { describe, expect, test } from 'bun:test'
import { GAMES } from '@es/play'
import { BENCH_COPY } from '@es/play/broken-bench/copy'
import { FLOOR_COPY } from '@es/play/engine-floor/copy'
import { LOOP_COPY } from '@es/play/loop/copy'
import { FULL_COPY } from '@es/play/loop/full/copy'
import { buildFullLevel } from '@es/play/loop/full/levels'
import { copyOf, wordsOf } from '@es/play/loop/full/session'
import { POOL_COPY } from '@es/play/pool/copy'
import { VERIFIER_COPY } from '@es/play/verifier/copy'
import { referenceWalks } from './state-copy-support'
import type { Walk } from './state-copy-support'

/**
 * Where a state holds a string, by game: the path, with each array index as `[]`. Every one is an id or a value of an enum, never a word a
 * learner reads: a level, a flaw, a stage of the tray, an engine, a lever's mode, a kind of ask or of span, a phase.
 */
const IDS: Readonly<Record<string, readonly string[]>> = {
  'broken-bench': ['.level.id', '.level.slots[].flaw', '.picks[]', '.rulings[].named', '.tab'],
  'engine-floor': ['.laid[]', '.level.id', '.level.reference[]', '.level.scenario.engine', '.level.tray[]'],
  loop: [
    // the front page's night
    '.batching',
    '.cpu[].kind',
    '.fires[].outcome[]',
    '.fires[].record.forward.kind',
    '.fires[].record.graph',
    '.gpu[].kind',
    '.level.goal',
    '.level.id',
    '.level.overlap',
    // the full service's stages: ids, cards, the levers' enum values, the backend's support
    '.level.stages[].bar',
    '.level.stages[].card',
    '.level.stages[].house.graphMode',
    '.level.stages[].house.inputIds',
    '.level.stages[].house.runner',
    '.level.stages[].id',
    '.level.stages[].levers[]',
    '.level.stages[].metric',
    '.level.stages[].naive.graphMode',
    '.level.stages[].naive.inputIds',
    '.level.stages[].naive.runner',
    '.level.stages[].prediction.kind',
    '.level.stages[].start.graphMode',
    '.level.stages[].start.inputIds',
    '.level.stages[].start.runner',
    '.level.stages[].support',
    '.stages[].levers.graphMode',
    '.stages[].levers.inputIds',
    '.stages[].levers.runner',
    '.stages[].night.levers.graphMode',
    '.stages[].night.levers.inputIds',
    '.stages[].night.levers.runner',
    '.stages[].served[].levers.graphMode',
    '.stages[].served[].levers.inputIds',
    '.stages[].served[].levers.runner',
  ],
  pool: [
    '.ask.for',
    '.ask.kind',
    '.history[].t',
    '.kv.pages[].st',
    '.level.id',
    '.level.preset',
    '.level.spec.groups[].id',
    '.level.spec.groups[].kind',
    '.level.tables[].letter',
    '.pending.kind',
    '.phase',
    '.reqs[].status',
  ],
  verifier: ['.labels[]', '.level.cards[]', '.level.id'],
}

/** What an id looks like: no space, no sentence, and nothing but the characters of the engines' own names. */
const ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** Every string in a value, with the path it stands at (array indices as `[]`). */
function stringsOf(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((item) => stringsOf(item, `${path}[]`))
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, item]) => stringsOf(item, `${path}.${key}`))
  return []
}

/** A seed the full service's levels are built on here: the words do not depend on it but for the modes stage's prompt. */
const FULL_STAGE_SEED = 0

const walks: Walk[] = referenceWalks()

describe('no display text in a state', () => {
  test('every built game and level is walked, at its start and along its reference run', () => {
    for (const game of GAMES.games) {
      for (const level of game.levels) {
        const walk = walks.find((w) => w.game === game.id && w.level === level.id)
        expect([game.id, level.id, walk !== undefined && walk.states.length > 0]).toEqual([game.id, level.id, true])
        // The run ends: it has more than its start.
        expect([game.id, level.id, (walk?.states.length ?? 0) > 1]).toEqual([game.id, level.id, true])
      }
    }
  })

  test('a state holds no string outside the closed list of ids and enum values, and each of those is shaped like an id', () => {
    const seen = new Map<string, Set<string>>()
    for (const walk of walks) {
      const allowed = new Set(IDS[walk.game])
      walk.states.forEach((state, at) => {
        for (const { path, text } of stringsOf(state)) {
          expect([walk.game, walk.level, at, path, allowed.has(path)]).toEqual([walk.game, walk.level, at, path, true])
          expect([walk.game, walk.level, at, path, ID_SHAPE.test(text)]).toEqual([walk.game, walk.level, at, path, true])
          if (!seen.has(walk.game)) seen.set(walk.game, new Set())
          seen.get(walk.game)?.add(path)
        }
      })
    }
    // The list is closed both ways: a path it names is one a state really holds.
    for (const [game, paths] of Object.entries(IDS)) for (const path of paths) expect([game, path, seen.get(game)?.has(path)]).toEqual([game, path, true])
  })

  test('no action of a reference run carries words: its strings are the action\'s kind and ids', () => {
    const KINDS = /^[a-z]+$/
    let counted = 0
    for (const walk of walks) {
      for (const action of walk.actions) {
        for (const { path, text } of stringsOf(action)) {
          counted += 1
          expect([walk.game, walk.level, path, ID_SHAPE.test(text)]).toEqual([walk.game, walk.level, path, true])
          if (path === '.t') expect(KINDS.test(text)).toBe(true)
        }
      }
    }
    expect(counted).toBeGreaterThan(100)
  })

  test('a prediction is committed as a number: the index of a choice, never the words of one', () => {
    for (const walk of walks.filter((w) => w.game === 'loop' && w.actions.length > 0)) {
      for (const action of walk.actions as { t: string; prediction?: unknown }[]) if (action.t === 'commit') expect(typeof action.prediction).toBe('number')
    }
  })
})

describe('the words are in copy.ts, by level id and stage id', () => {
  const copies: Readonly<Record<string, Readonly<Record<string, { title: string; prompt: string }>>>> = {
    loop: { ...LOOP_COPY, ...FULL_COPY },
    pool: POOL_COPY,
    verifier: VERIFIER_COPY,
    'engine-floor': FLOOR_COPY,
    'broken-bench': BENCH_COPY,
  }

  test('each level the registry lists has a title (the one the registry shows) and a prompt, and the copy lists no other', () => {
    for (const game of GAMES.games) {
      const copy = copies[game.id]
      expect([game.id, Object.keys(copy).sort()]).toEqual([game.id, game.levels.map((level) => level.id).sort()])
      for (const level of game.levels) {
        expect([game.id, level.id, copy[level.id].title]).toEqual([game.id, level.id, level.title])
        expect(copy[level.id].prompt.length).toBeGreaterThan(40)
      }
    }
  })

  test('each stage of the full service has its title, prompt and prediction words, and the words fit the stage\'s rule', () => {
    for (const [id, level] of Object.entries(FULL_COPY)) {
      const built = buildFullLevel(id, FULL_STAGE_SEED)
      expect([id, Object.keys(level.stages).sort()]).toEqual([id, built.stages.map((stage) => stage.id).sort()])
      for (const world of built.stages) {
        const words = wordsOf(built.id, world)
        expect(words.title).toBe(copyOf(built.id, world.id).title)
        expect(words.prompt.length).toBeGreaterThan(40)
        expect(words.prediction.kind).toBe(world.prediction.kind)
        if (words.prediction.kind === 'choice') expect(world.answer).toBeLessThan(words.prediction.options.length)
      }
    }
  })
})
