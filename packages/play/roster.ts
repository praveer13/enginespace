/**
 * The roster (ARCHITECTURE §6.1, D-063): the nine games of the course, built or not, each with the title a learner sees (the engine's
 * term), its subtitle (the game's rule in one line), its role line (who the learner is in it), the modules that use it, whether it has a 3D
 * scene, and the wave that builds it.
 *
 * The registry (`registry.ts`) holds the games that are built, and each game's task adds its own entry there. The roster holds the
 * course's whole list, which the Games index needs to say what is published and what is not without sending a learner to a page that is
 * not there. It carries what is known of a game before any of its code exists: no keys, no levels, no session. For a game that is built,
 * `tests/play/roster.test.ts` holds the roster's row to the registry's entry, so the two cannot say different things; and it holds the
 * roster to D-063's table (REDESIGN §2.7), the role lines of REDESIGN §2.6, ARCHITECTURE §6.1's table and the tracker's task titles, so
 * that neither can drift from the documents.
 *
 * The rows run in the order of the course: by the home module of each game.
 *
 * The package's index does not export it. The front page imports the index (the registry's keys and levels), its first-paint budget has
 * no room for a list that only the Games index and the module pages read (ARCHITECTURE §6.10, D-023), and they import `@es/play/roster`.
 */

export interface RosterEntry {
  /** The game's id, the one in `/play/<id>` and in `play:<game>/<level>` refs. */
  readonly id: string
  /** The title: the engine's term for what the game draws (D-063). */
  readonly title: string
  /** The game's rule in one line (D-063). */
  readonly subtitle: string
  /** Who the learner is in the game, in one short sentence: "You are the scheduler." (REDESIGN §2.6). */
  readonly role: string
  /** The modules that use the game, the first being its home. */
  readonly modules: readonly string[]
  /** Whether the game has a 3D scene. Every game has a 2D view (A§6.2). */
  readonly has3d: boolean
  /** The wave whose tasks build the game's session and views: 0 is the front page's (the tracker's W0). */
  readonly wave: 0 | 1 | 2
}

export const ROSTER: readonly RosterEntry[] = Object.freeze([
  { id: 'shape-shifter', title: 'Tensor views', subtitle: 'A view relabels the buffer. A copy moves every element.', role: 'You lay out a tensor.', modules: ['tr0'], has3d: true, wave: 2 },
  { id: 'engine-floor', title: 'Request path', subtitle: 'Every queue, IPC hop, copy and sync between the API server and the GPU.', role: 'You trace one request.', modules: ['tr1'], has3d: true, wave: 1 },
  { id: 'loop', title: 'Step loop', subtitle: 'Keep every slot live, and never make the GPU wait for the CPU.', role: 'You are the scheduler.', modules: ['tr2', 'tr6'], has3d: true, wave: 0 },
  { id: 'gap-hunt', title: 'Trace attribution', subtitle: 'Every nanosecond of a step belongs to a kernel, a copy, a CPU gap or idle.', role: 'You account for a step.', modules: ['tr3', 'capstone'], has3d: false, wave: 2 },
  { id: 'dispatch', title: 'Backend dispatch', subtitle: 'The first attention backend that meets every requirement takes the call.', role: 'You predict the backend.', modules: ['tr4'], has3d: false, wave: 2 },
  { id: 'pool', title: 'KV page pool', subtitle: 'One page pool serves every KV group and every adapter.', role: 'You are the KV allocator.', modules: ['tr5a'], has3d: true, wave: 1 },
  { id: 'switchyard', title: 'KV offload', subtitle: 'A page in transit cannot be read, and every move is published as an event.', role: 'You move KV between tiers.', modules: ['tr5b'], has3d: true, wave: 2 },
  { id: 'verifier', title: 'Rejection sampler', subtitle: 'Accept with min(1, p/q), resample from (p - q)+, and the output is exactly p.', role: 'You are the verifier.', modules: ['tr6'], has3d: true, wave: 1 },
  { id: 'broken-bench', title: 'Broken benchmark', subtitle: 'Latency counts from when a request was due.', role: 'You audit a benchmark.', modules: ['tr8'], has3d: false, wave: 1 },
] satisfies readonly RosterEntry[])

/** The roster's row for a game id, or undefined. */
export const rosterEntry = (id: string): RosterEntry | undefined => ROSTER.find((entry) => entry.id === id)
