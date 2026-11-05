/**
 * The roster (ARCHITECTURE §6.1, D-049): the nine games of the course, built or not, each with the name and subtitle a learner
 * sees, the modules that use it, whether it has a 3D scene, and the wave that builds it.
 *
 * The registry (`registry.ts`) holds the games that are built, and each game's task adds its own entry there. The roster holds the
 * course's whole list, which the Play index needs to say what arrives and when without sending a learner to a page that is not
 * there. It carries what is known of a game before any of its code exists: no keys, no levels, no session. For a game that is built,
 * `tests/play/roster.test.ts` holds the roster's row to the registry's entry, so the two cannot say different things; and it holds
 * the roster to D-049's table, ARCHITECTURE §6.1's table and the tracker's task titles, so that neither can drift from the documents.
 *
 * The rows run in the order of the course: by the home module of each game.
 *
 * The package's index does not export it. The front page imports the index (the registry's keys and levels), its first-paint budget has
 * no room for a list that only the Play index and the module pages read (ARCHITECTURE §6.10, D-023), and they import `@es/play/roster`.
 */

export interface RosterEntry {
  /** The game's id, the one in `/play/<id>` and in `play:<game>/<level>` refs. */
  readonly id: string
  /** The display name (D-049). */
  readonly title: string
  /** The engine concept the display name stands for (D-049). */
  readonly subtitle: string
  /** The modules that use the game, the first being its home. */
  readonly modules: readonly string[]
  /** Whether the game has a 3D scene. Every game has a 2D view (A§6.2). */
  readonly has3d: boolean
  /** The wave whose tasks build the game's session and views: 0 is the front page's (the tracker's W0). */
  readonly wave: 0 | 1 | 2
}

export const ROSTER: readonly RosterEntry[] = Object.freeze([
  { id: 'shape-shifter', title: 'Sheet Pan', subtitle: 'tensor views and copies', modules: ['tr0'], has3d: true, wave: 2 },
  { id: 'engine-floor', title: 'Back of House', subtitle: "a request's lifecycle", modules: ['tr1'], has3d: true, wave: 1 },
  { id: 'loop', title: 'Service', subtitle: 'the step loop', modules: ['tr2', 'tr6'], has3d: true, wave: 0 },
  { id: 'gap-hunt', title: 'The Tape', subtitle: 'trace attribution', modules: ['tr3', 'capstone'], has3d: false, wave: 2 },
  { id: 'dispatch', title: 'Line Check', subtitle: 'attention backend selection', modules: ['tr4'], has3d: false, wave: 2 },
  { id: 'pool', title: 'The Reach-In', subtitle: 'hybrid KV pages and adapters', modules: ['tr5a'], has3d: true, wave: 1 },
  { id: 'switchyard', title: 'The Dumbwaiter', subtitle: 'KV offload, connector and events', modules: ['tr5b'], has3d: true, wave: 2 },
  { id: 'verifier', title: 'The Tasting', subtitle: "speculative decoding's verifier", modules: ['tr6'], has3d: true, wave: 1 },
  { id: 'broken-bench', title: 'The Inspection', subtitle: 'benchmark methodology', modules: ['tr8'], has3d: false, wave: 1 },
] satisfies readonly RosterEntry[])

/** The roster's row for a game id, or undefined. */
export const rosterEntry = (id: string): RosterEntry | undefined => ROSTER.find((entry) => entry.id === id)
