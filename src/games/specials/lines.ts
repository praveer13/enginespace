/*
 * The lines of the Games index: the nine games of the course, each as the row the page prints for it, worked out from the roster and
 * the registry as pure functions. A game is published when `/play/<id>` resolves to it, which is when its record and its component are
 * both registered (src/games/registry.ts); every other game of the roster is listed with what it teaches, says it is not published
 * yet, and is never a link to a page that is not there. A level's best attempt is worked out from the ledger's events the same way.
 */
import type { GameEntry } from '@es/play'
import type { RosterEntry } from '@es/play/roster'
import type { LedgerEvent } from '@es/ledger'
import { attemptWord } from '@/progress/next'
import type { AttemptWord } from '@/progress/next'
import { ATTEMPT_WORDS } from '@/progress/words'

/** A level as the page lists it: its name, whether it can be graded, and where it opens. */
export interface LevelLine {
  readonly id: string
  readonly title: string
  /** `graded` when the level can be graded, `practice` when it can only be practised. */
  readonly kind: 'practice' | 'graded'
  readonly href: string
}

export interface Line {
  readonly id: string
  /** The engine's term for what the game draws. */
  readonly title: string
  /** The game's rule in one line. */
  readonly subtitle: string
  /** Who the learner is in the game: "You are the scheduler." */
  readonly role: string
  /** The modules that use the game, the first being its home. */
  readonly modules: readonly string[]
  readonly has3d: boolean
}

export interface PublishedLine extends Line {
  readonly published: true
  readonly levels: readonly LevelLine[]
}

export interface UnpublishedLine extends Line {
  readonly published: false
}

export type GameLine = PublishedLine | UnpublishedLine

/**
 * The roster, in the order of the course, with each game that is built carrying the levels and the words its registry record says, and
 * each game that is not saying what the roster says.
 */
export function gameLines(roster: readonly RosterEntry[], registered: (id: string) => GameEntry | undefined, playable: (id: string) => boolean): readonly GameLine[] {
  return roster.map((entry): GameLine => {
    const built = registered(entry.id)
    if (built !== undefined && playable(entry.id)) {
      return {
        published: true,
        id: built.id,
        title: built.title,
        subtitle: built.subtitle,
        role: entry.role,
        modules: built.modules,
        has3d: built.has3d,
        levels: built.levels.map((level) => ({
          id: level.id,
          title: level.title,
          kind: level.graded ? 'graded' : 'practice',
          href: `/play/${built.id}?level=${encodeURIComponent(level.id)}`,
        })),
      }
    }
    return { published: false, id: entry.id, title: entry.title, subtitle: entry.subtitle, role: entry.role, modules: entry.modules, has3d: entry.has3d }
  })
}

const RANK: Readonly<Record<AttemptWord, number>> = { [ATTEMPT_WORDS.no]: 0, [ATTEMPT_WORDS.practice]: 1, [ATTEMPT_WORDS.yes]: 2 }

/** The learner's best attempt at one level, in words: passed over passed in practice over not yet. Another level's run never counts. */
export function bestAttempt(events: readonly LedgerEvent[], game: string, level: string): AttemptWord {
  const ref = `play:${game}/${level}`
  let best: AttemptWord = ATTEMPT_WORDS.no
  for (const event of events) {
    if (event.kind !== 'play' || event.ref !== ref) continue
    const word = attemptWord(event)
    if (RANK[word] > RANK[best]) best = word
  }
  return best
}
