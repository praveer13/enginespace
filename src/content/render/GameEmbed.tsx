import { Suspense, useEffect, useRef } from 'react'
import type { GameMode, RunResult } from '@es/play'
import { NotRecorded } from '@/games/kit/NotRecorded'
import { useRecorder } from '@/games/kit/useRecorder'
import { resolveGame } from '@/games/registry'
import { ClaimLease } from '@/scene/lease'
import type { Of } from './BlockFrame'
import { GameLoading } from './GameBlock'
import { finishBlockRun } from './runs'

/*
 * The game of a lesson's game block, at the block's level and in its mode (A§4.3; W1b-T01). This is the block's lazy half: it loads when
 * the learner starts the level, with the games' registry (src/games/registry.ts), and the game's own chunk follows it, as on the game's
 * own page; the game's scene and three load after that, and only where the device draws 3D.
 *
 *   - The game sits in the lesson (`placement="embed"`): a heading a level lower, its parts laid out for the column, no other level.
 *   - Its Stage takes the page's one live 3D canvas when it first wants it (ClaimLease): the level asked for last is the one in 3D.
 *   - A run that ends goes to the ledger through the recorder, as from the game's own page, and to the page's runs (runs.ts), where the
 *     prediction box finds it.
 *   - Focus goes to the game once it is on the page, so its keys work at once: the stub that was pulled has gone.
 */

export interface GameEmbedProps {
  block: Of<'game'>
  scope: string
  at: number
  rev?: string
  /** The game's display name, for the line that waits for its code. */
  title: string
}

export default function GameEmbed({ block, scope, at, rev, title }: GameEmbedProps) {
  const box = useRef<HTMLDivElement>(null)
  const recorder = useRecorder()
  const { record } = recorder

  // Focus moves to the game when it appears, unless the learner has put it somewhere else of their own while it loaded.
  useEffect(() => {
    const element = box.current
    if (element === null) return
    const here = element.closest('.es-c-game') ?? element
    const settle = (): boolean => {
      const target = element.querySelector<HTMLElement>('[data-game]')
      if (target === null) return false
      const active = document.activeElement
      if (active === null || active === document.body || here.contains(active)) target.focus()
      return true
    }
    if (settle()) return
    const watch = new MutationObserver(() => {
      if (settle()) watch.disconnect()
    })
    watch.observe(element, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [])

  const game = resolveGame(block.id)
  if (game.kind === 'unknown') {
    // GAME_TASKS and the registry hold every game of the roster between them (tests/content/pending.test.ts), so this is never drawn.
    return <p className="es-c-game__loading">No game is called {block.id}.</p>
  }
  const Game = game.Component
  const finish = (result: RunResult, mode: GameMode) => {
    finishBlockRun({ scope, at, game: block.id, level: result.record.level, mode, result })
    record(result, mode)
  }
  return (
    <div ref={box} className="es-c-game__embed">
      <ClaimLease.Provider value>
        <Suspense fallback={<GameLoading title={title} />}>
          <Game level={block.level} mode={block.mode} placement="embed" rev={rev} onFinish={finish} />
        </Suspense>
      </ClaimLease.Provider>
      {recorder.problem === null ? null : <NotRecorded detail={recorder.problem} />}
    </div>
  )
}
