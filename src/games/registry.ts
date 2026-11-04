import type { ComponentType, LazyExoticComponent } from 'react'
import { GAMES } from '@es/play'
import type { GameEntry, GameMode, GameRegistry, RunResult } from '@es/play'

/*
 * The component registry (ARCHITECTURE §6.3): the one place a game id turns into a component. `/play/:game` and a lesson's
 * `game` block both resolve through it, so a game is added here and in packages/play/registry.ts and nowhere else.
 * It is kernelspace's PLAY_REGISTRY pattern. Each game is a lazy module, so the page that lists games, and the front page's
 * first paint, carry none of their code until a game opens. A game's 3D scene is lazier still: its Game.tsx loads the scene
 * behind React.lazy, and verify:boundaries fails any static path to three.
 *
 * packages/play/registry.ts holds what is known about a game without running it: its display name, keys, levels and sources.
 * This file holds the code. `verify:games` fails when the two do not list the same ids.
 */

/** What every game's `Game.tsx` takes. */
export interface GameProps {
  /** The level to open: an id from the game's registry entry. Default: its first. */
  level?: string
  /** `practice` plays the level's pinned seed. `graded` draws a seed when the run starts. Default `practice`. */
  mode?: GameMode
  /** `embed` inside a lesson, with a smaller heading, or `page` on its own page. Default `page`. */
  placement?: 'embed' | 'page'
  /** The lesson's content revision, which the run record carries (A§4.2). */
  rev?: string
  /** Called once when a run ends. The front page passes nothing, because its runs are practice and record nothing (D-038). */
  onFinish?: (result: RunResult) => void
}

export type GameComponent = LazyExoticComponent<ComponentType<GameProps>>

/** The lazy component of each game, by id: `loop: lazy(() => import('./loop/Game'))`, which W0-T16 adds as the first. */
export const GAME_COMPONENTS: Readonly<Record<string, GameComponent>> = {}

export type GameResolution = { kind: 'game'; id: string; entry: GameEntry; Component: GameComponent } | { kind: 'unknown'; id: string }

/**
 * A game's record and its component, or unknown. Only own properties count: an id such as `constructor` is not a game. A game
 * missing from either registry is unknown, so a half-registered game never renders, and `verify:games` says which half.
 */
export function resolveGame(id: string, registry: GameRegistry = GAMES, components: Readonly<Record<string, GameComponent>> = GAME_COMPONENTS): GameResolution {
  const entry = registry.get(id)
  return entry !== undefined && Object.hasOwn(components, id) ? { kind: 'game', id, entry, Component: components[id] } : { kind: 'unknown', id }
}
