import type { PoolView } from '@es/play/pool/types'

/*
 * The pans chosen to be dumped (GAMES.md §8: "pick a cached page from the free line, or tap it in the rack"). The choice is the page's, not
 * the session's: it is a draft of one action until the learner confirms it, and it starts as what the engine would do on its own, the
 * rotation's next pans, so that a learner who agrees with the engine presses one button and one who does not changes what they disagree
 * with. It starts again whenever a new ask opens.
 *
 * The page holds the draft (`Chosen`), because the 2D view, the list and the keys all read it, and each of them gets the run's view only
 * when the shell calls its slot. `dumpOf` reads the draft against a view and says what the pans chosen are, which is the draft if it was
 * made for this ask and the engine's pans if not. It is a function and not a hook, so that every slot can call it.
 */

/** A draft: the ask it was made for, and the pans chosen. */
export interface Chosen {
  readonly key: string
  readonly pages: readonly number[]
}

export interface Dump {
  /** An eviction is the open ask. */
  readonly open: boolean
  /** How many pans must go. */
  readonly need: number
  readonly pages: readonly number[]
  /** Exactly `need` pans of the ones on offer are chosen, so the dump can be confirmed. */
  readonly ready: boolean
  isPicked(page: number): boolean
  toggle(page: number): void
  /** Back to the rotation's next pans. */
  reset(): void
}

/** A key for the open eviction that changes with every new one. */
const keyOf = (view: PoolView): string => {
  const ask = view.ask
  return ask === null || ask.kind !== 'evict' ? '' : `${view.step}:${ask.for}:${ask.target}:${ask.need}:${ask.candidates.length}`
}

export function dumpOf(view: PoolView, chosen: Chosen | null, choose: (next: Chosen | null) => void): Dump {
  const ask = view.ask !== null && view.ask.kind === 'evict' ? view.ask : null
  const key = keyOf(view)
  const pages: readonly number[] = ask === null ? [] : chosen !== null && chosen.key === key ? chosen.pages : ask.candidates.slice(0, ask.need)
  const need = ask === null ? 0 : ask.need
  return {
    open: ask !== null,
    need,
    pages,
    ready: ask !== null && pages.length === need && pages.every((page) => ask.candidates.includes(page)),
    isPicked: (page) => pages.includes(page),
    toggle: (page) => {
      if (ask === null || !ask.candidates.includes(page)) return
      choose({ key, pages: pages.includes(page) ? pages.filter((p) => p !== page) : [...pages, page] })
    },
    reset: () => choose(null),
  }
}
