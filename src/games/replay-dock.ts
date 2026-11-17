import type { LiveRun } from '@/games/kit/RunContext'

/*
 * What a figure's "Show on the machine" needs from a game (R-T45): the game's compact view of the state a list of actions leads to, as the dock draws a
 * run. Each game that a figure may replay (REPLAY_GAMES in the schema) gives one loader here, and the game's code loads when the learner asks for it, so a
 * lesson that holds no replay carries none of it.
 */

/** A figure's `replay`, as the block carries it. */
export interface ReplayRequest {
  readonly level: string
  readonly seed: number
  readonly actions: readonly { readonly t: string; readonly [field: string]: unknown }[]
}

/** The state the actions lead to, in the dock's own terms. */
export interface ReplayDock {
  readonly gameTitle: string
  readonly levelTitle: string
  readonly view: unknown
  readonly done: boolean
  readonly turns: number
  readonly DockView: LiveRun['DockView']
}

const LOADERS: Readonly<Record<string, () => Promise<(request: ReplayRequest) => Promise<ReplayDock>>>> = {
  loop: async () => (await import('./loop/replayDock')).loopReplayDock,
}

/** The dock's view of a figure's state. Rejects for a game that has no loader, or a log that does not replay. */
export async function loadReplayDock(game: string, request: ReplayRequest): Promise<ReplayDock> {
  const load = Object.hasOwn(LOADERS, game) ? LOADERS[game] : undefined
  if (load === undefined) throw new Error(`no replay for the game "${game}"`)
  return (await load())(request)
}
