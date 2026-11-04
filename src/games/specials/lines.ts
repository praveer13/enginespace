/*
 * The lines of the specials board (W1-T06): the games of the course, each as the line the Play index prints for it, worked out from the
 * roster and the registry as pure functions. A game is on the board to play when `/play/<id>` resolves to it, which is when its record
 * and its component are both registered (src/games/registry.ts); every other game of the roster hangs as arriving, with the wave that
 * brings it, and is never a link to a page that is not there.
 */
import type { GameEntry } from '@es/play'
import type { RosterEntry } from '@es/play/roster'

export interface Line {
  readonly id: string
  /** The display name (D-049). */
  readonly title: string
  /** The engine concept the display name stands for (D-049). */
  readonly subtitle: string
  /** The modules that use the game, the first being its home. */
  readonly modules: readonly string[]
  readonly has3d: boolean
}

export interface OpenLine extends Line {
  readonly kind: 'open'
}

export interface ArrivingLine extends Line {
  readonly kind: 'arriving'
  /** The wave that brings the game (the tracker's), as the roster has it. */
  readonly wave: RosterEntry['wave']
}

export interface Board {
  /** The games that can be played, in the order of the course. */
  readonly open: readonly OpenLine[]
  /** The games that are not built yet, in the order of the course. */
  readonly arriving: readonly ArrivingLine[]
}

/**
 * Sorts the roster into what can be played and what is coming. A game that can be played says what its registry record says, which
 * tests/play/roster.test.ts holds equal to the roster's row; a game that cannot says what the roster says.
 */
export function boardOf(roster: readonly RosterEntry[], registered: (id: string) => GameEntry | undefined, playable: (id: string) => boolean): Board {
  const open: OpenLine[] = []
  const arriving: ArrivingLine[] = []
  for (const entry of roster) {
    const built = registered(entry.id)
    if (built !== undefined && playable(entry.id)) {
      open.push({ kind: 'open', id: built.id, title: built.title, subtitle: built.subtitle, modules: built.modules, has3d: built.has3d })
    } else {
      arriving.push({ kind: 'arriving', id: entry.id, title: entry.title, subtitle: entry.subtitle, modules: entry.modules, has3d: entry.has3d, wave: entry.wave })
    }
  }
  return { open, arriving }
}
