import { useMemo } from 'react'
import { GAMES } from '@es/play'
import { ROSTER } from '@es/play/roster'
import { resolveGame } from '@/games/registry'
import { boardOf } from '@/games/specials/lines'
import { SpecialsView } from '@/games/specials/Specials'

/*
 * `/play` (ARCHITECTURE §3.1): the games index, set out as the specials board (src/games/specials). Which games can be played comes
 * from the registry and the component registry together, as `/play/:game` resolves them, and the rest of the roster hangs as arriving.
 * The page reads no store.
 */
export function Component() {
  const board = useMemo(
    () =>
      boardOf(
        ROSTER,
        (id) => GAMES.get(id),
        (id) => resolveGame(id).kind === 'game',
      ),
    [],
  )
  return <SpecialsView board={board} />
}
