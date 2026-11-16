import { DOCK_STEP_WORDS, lookLine, moveWords, partsOf, POOL_MOMENTS, type PoolMoment } from '@es/play/pool/copy'
import { poolInit, poolReference, poolSession } from '@es/play/pool/session'
import type { PoolAction, PoolLevelId, PoolView } from '@es/play/pool/types'
import type { GameKit, KitMoment, KitPart } from '@/games/kit/first-move'
import { DockView } from './DockView'

/*
 * What KV page pool gives the instrument frame (REDESIGN §2.6, R-T08): its parts on a level with where each is drawn, its named moments
 * with the object each is said beside, and its first run. The words are packages/play/pool/copy.ts's; this file only places them.
 */

/** Where each part is drawn, inside the frame: the intro's callout sits on it. A part with none is named in the list only. */
const ANCHORS: Readonly<Record<string, string>> = {
  pool: '[data-pool-grid] .es-pool__label',
  page: '[data-pool-legend] .es-legend, [data-pool-legend]',
  waiting: '[data-pool-waiting] .es-pool__label, [data-ask-list="admit"]',
  batch: '[data-pool-batch] .es-pool__label',
  cost: '[data-pool-readout] [data-readout-id="recomputed"], [data-pool-readout] [data-readout-id="cost"]',
  'free-queue': '[data-pool-queue] .es-pool__label',
  conversation: '[data-ask-list="admit"] .es-dock__option-meta',
  'kv-group': '[data-pool-legend] .es-pool__groups',
}

/** The parts the level draws, as the Parts list shows them, with vLLM's identifier set as code. */
export const partRows = (level: PoolLevelId): KitPart[] =>
  partsOf(level).map((part) => ({
    id: part.id,
    name: part.name,
    ...(ANCHORS[part.id] === undefined ? {} : { anchor: ANCHORS[part.id] }),
    sentence:
      part.engine === undefined ? (
        part.sentence
      ) : (
        <>
          {part.sentence} In vLLM: <code>{part.engine}</code>.
        </>
      ),
  }))

/** Where a named moment is said: beside the request it is about, the cost in the readout, or the free queue. */
const nearOf = (near: ReturnType<PoolMoment['near']>): string =>
  near.kind === 'request'
    ? `[data-pool-batch] [data-req="${near.id}"]`
    : near.kind === 'queue'
      ? '[data-pool-queue] .es-pool__label'
      : '[data-pool-readout] [data-readout-id="recomputed"], [data-pool-readout] [data-readout-id="cost"]'

const MOMENTS: readonly KitMoment<PoolView>[] = POOL_MOMENTS.map((moment) => ({
  id: moment.id,
  line: moment.line,
  anchor: (before, after) => nearOf(moment.near(before, after)),
}))

const levelParts = (level: string): readonly string[] => partsOf(level as PoolLevelId).map((part) => part.id)

/**
 * The move Step takes: the first option the open decision lists. Admit the first request that fits, evict the pages at the front of the free
 * queue (the engine's own order), preempt the first request offered, load the first adapter. Null when no decision is open.
 */
export function poolStep(view: PoolView): PoolAction | null {
  const ask = view.ask
  if (ask === null) return null
  switch (ask.kind) {
    case 'admit':
      return { t: 'admit', req: ask.candidates[0] ?? null }
    case 'evict':
      return { t: 'evict', pages: [...ask.candidates.slice(0, ask.need)].sort((a, b) => a - b) }
    case 'preempt':
      return ask.candidates.length === 0 ? null : { t: 'preempt', req: ask.candidates[0] }
    case 'prefetch':
      return { t: 'prefetch', adapter: ask.candidates[0] ?? null }
  }
}

/**
 * What the pool gives the frame (REDESIGN §2.6): its drawing, its parts on this level, its named moments, and its first run. The first ask
 * is the level's guess, which the session lets the learner skip, and before it the learner looks at the first waiting request. The pointed
 * first move is the reference run's first action on this level and seed.
 */
export function poolKit(levelId: PoolLevelId, seed: number): GameKit<PoolAction, PoolView, never> {
  const start = poolInit(poolSession.level(levelId, seed))
  const ask = poolSession.ask(start)
  const firstMove = ask === null ? null : poolReference(start, ask)
  return {
    parts: partRows(levelId),
    moments: MOMENTS,
    firstMove,
    firstMoveWords: firstMove === null ? '' : moveWords(firstMove),
    firstAsk: 'optional',
    askOpen: (view) => view.predict.open,
    isAsk: (action) => action.t === 'commit',
    askWords: (view) => view.predict.ask,
    look: (view) => {
      const id = view.waiting[0]
      if (id === undefined) return null
      return {
        label: `Request ${id + 1}`,
        title: `Request ${id + 1}, waiting`,
        detail: lookLine(view.tickets[id]),
        anchor: '[data-ask-list="admit"] li:first-child',
      }
    },
    levelParts,
    DockView,
    step: poolStep,
    stepWords: DOCK_STEP_WORDS,
  }
}

