import { useMemo } from 'react'
import { ROSTER } from '@es/play/roster'
import { ROWS } from '@es/play/rows'
import { useEvidence } from '@/evidence/useEvidence'
import { resolveGame } from '@/games/registry'
import { bestAttempt, gameLines } from '@/games/specials/lines'
import { SpecialsView } from '@/games/specials/Specials'
import type { AttemptWord } from '@/progress/next'

/*
 * `/play` (ARCHITECTURE §3.1): the Games index, a plain list of the nine games (REDESIGN §3.8). Which games can be played comes from the
 * registry and the component registry together, as `/play/:game` resolves them. The learner's best attempt at each level is read from
 * the ledger's events when it has opened, and stored nowhere.
 */
export function Component() {
  const { ready, events } = useEvidence()
  const lines = useMemo(
    () =>
      gameLines(
        ROSTER,
        (id) => ROWS.get(id),
        (id) => resolveGame(id).kind === 'game',
      ),
    [],
  )
  const attempts = useMemo(() => {
    if (!ready) return null
    const best = new Map<string, AttemptWord>()
    for (const line of lines) {
      if (line.published) for (const level of line.levels) best.set(`${line.id}/${level.id}`, bestAttempt(events, line.id, level.id))
    }
    return best
  }, [lines, ready, events])
  return <SpecialsView lines={lines} attempts={attempts} />
}
