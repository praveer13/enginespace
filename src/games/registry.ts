import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameEntry, GameMode, RunResult } from '@es/play'

/*
 * The component registry (ARCHITECTURE §6.3): the one place a game id turns into a component. `/play/:game` and a lesson's
 * `game` block both resolve through it, so a game is added here and in packages/play/registry.ts and nowhere else.
 * It is kernelspace's PLAY_REGISTRY pattern. Each game is a lazy module, so the page that lists games, and the front page's
 * first paint, carry none of their code until a game opens. A game's 3D scene is lazier still: its Game.tsx loads the scene
 * behind React.lazy, and verify:boundaries fails any static path to three.
 *
 * packages/play/registry.ts holds what is known about a game without running it: its display name, keys, levels and sources.
 * This file holds the code, and a loader of each game's record (its `entry.ts`) rather than the list of every record: a game's page
 * loads its own record and no other game's, so a game that joins the course costs the other games' pages nothing. A game joins by
 * adding its component and its record's loader below, and its entry to `GAMES` in packages/play/registry.ts. `verify:games` fails
 * when the three do not list the same ids, or when a loader brings a record of another id.
 */

/** What every game's `Game.tsx` takes. */
export interface GameProps {
  /** The level to open: an id from the game's registry entry. Default: its first. */
  level?: string
  /** `practice` plays the level's pinned seed. `graded` draws a seed when the run starts. Default `practice`. */
  mode?: GameMode
  /**
   * `embed` inside a lesson, or `page` on its own page. Default `page`. Embedded, the game has a smaller heading, lays its parts out for
   * the lesson's column (the frame's `embedded`), and offers no other level: the lesson names the level, and its own blocks are the
   * order of the levels (W1b-T01).
   */
  placement?: 'embed' | 'page'
  /** The lesson's content revision, which the run record carries (A§4.2). */
  rev?: string
  /**
   * Called once when a run ends, with the run's mode. The game's page and a lesson's block each pass the recorder (src/games/kit/record.ts),
   * which writes the same `play` event from both. The front page passes nothing, because its runs are practice and record nothing (D-038).
   */
  onFinish?: (result: RunResult, mode: GameMode) => void
}

export type GameComponent = LazyExoticComponent<ComponentType<GameProps>>

/** The lazy component of each game, by id. Each game's task adds its own: `loop` is the first (W0-T16), `verifier` follows (W1-T28), then `engine-floor` (W1-T17), `broken-bench` (W1-T33) and `pool` (W1-T23). */
export const GAME_COMPONENTS: Readonly<Record<string, GameComponent>> = {
  loop: lazy(() => import('./loop/Game')),
  verifier: lazy(() => import('./verifier/Game')),
  'engine-floor': lazy(() => import('./engine-floor/Game')),
  'broken-bench': lazy(() => import('./broken-bench/Game')),
  pool: lazy(() => import('./pool/Game')),
}

/**
 * A loader of one game's record: the `record()` of the game's `record.ts`, which returns its `entry.ts` from packages/play, the same object
 * that `GAMES` holds for it. The loader goes through `record.ts` and not to `entry.ts` itself, because a module that is loaded with
 * `import()` keeps its export names in the build, and every page that reads a record by `GAMES` (and the front page, Service's) would pay
 * for the names.
 */
export type RecordLoader = () => Promise<GameEntry>

/** The loader of each game's record, by id: the same ids as the components above and as `GAMES`. */
export const GAME_RECORDS: Readonly<Record<string, RecordLoader>> = {
  loop: () => import('./loop/record').then((module) => module.record()),
  verifier: () => import('./verifier/record').then((module) => module.record()),
  'engine-floor': () => import('./engine-floor/record').then((module) => module.record()),
  'broken-bench': () => import('./broken-bench/record').then((module) => module.record()),
  pool: () => import('./pool/record').then((module) => module.record()),
}

export type GameResolution = { kind: 'game'; id: string; record: RecordLoader; Component: GameComponent } | { kind: 'unknown'; id: string }

/**
 * A game's component and the loader of its record, or unknown, without loading anything. Only own properties count: an id such as
 * `constructor` is not a game. A game missing from either table is unknown, so a half-registered game never renders, and
 * `verify:games` says which half.
 */
export function resolveGame(id: string, components: Readonly<Record<string, GameComponent>> = GAME_COMPONENTS, records: Readonly<Record<string, RecordLoader>> = GAME_RECORDS): GameResolution {
  return Object.hasOwn(components, id) && Object.hasOwn(records, id) ? { kind: 'game', id, record: records[id], Component: components[id] } : { kind: 'unknown', id }
}

export type LoadedGame = { kind: 'game'; id: string; entry: GameEntry; Component: GameComponent } | { kind: 'unknown'; id: string }

/**
 * A game's record and its component, or unknown: what `/play/:game` renders. It loads the one record the id names, and no other game's.
 * A loader that brings a record of another id is a game registered under the wrong name, and is unknown here as `verify:games` fails it.
 */
export async function loadGame(id: string, components: Readonly<Record<string, GameComponent>> = GAME_COMPONENTS, records: Readonly<Record<string, RecordLoader>> = GAME_RECORDS): Promise<LoadedGame> {
  const found = resolveGame(id, components, records)
  if (found.kind === 'unknown') return found
  const entry = await found.record()
  return entry.id === id ? { kind: 'game', id, entry, Component: found.Component } : { kind: 'unknown', id }
}
