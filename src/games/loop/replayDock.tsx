import { FULL_LEVEL_IDS } from '@es/play/loop/full/levels'
import { serviceSession } from '@es/play/loop/game'
import { LOOP } from '@es/play/loop/entry'
import { levelOf } from '@es/play/keys'
import { replay } from '@es/play/replay'
import type { GameAction } from '@es/play'
import type { ReplayDock, ReplayRequest } from '@/games/replay-dock'
import type { LiveRun } from '@/games/kit/RunContext'
import { DockView } from './DockView'

/*
 * The step loop's state for a figure's "Show on the machine" (R-T45): the figure's actions replayed on the pure session from the level's start, and the
 * game's own compact view of where they lead, which is the dock's view of a run. The first service's levels draw the first service's timing diagram, the
 * full service's its own. The compiler has replayed the same log (scripts/content/directives.ts), so a log that fails here is one the build let through,
 * and the dock says so rather than showing a wrong state.
 */
export async function loopReplayDock({ level, seed, actions }: ReplayRequest): Promise<ReplayDock> {
  const played = replay(serviceSession, { game: 'loop', level, seed, actions: actions as readonly GameAction[] })
  if (!played.ok) throw new Error(played.reason)
  const full = (FULL_LEVEL_IDS as readonly string[]).includes(level)
  const View = full ? (await import('./full/DockView')).FullDockView : DockView
  return {
    gameTitle: LOOP.title,
    levelTitle: levelOf(LOOP, level)?.title ?? level,
    view: serviceSession.view(played.state),
    done: played.finished,
    turns: actions.length,
    DockView: View as LiveRun['DockView'],
  }
}
