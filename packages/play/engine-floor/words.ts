/**
 * Back of House's words and marks (GAMES.md §2.6, "Back of House"; D-049): the kitchen's name for each hand-off, the floor each process
 * stands on, and the drawn mark each hand-off has. All of it is data, so the 2D view, the tray, the mirror and (W1-T18) the 3D scene
 * say the same things.
 *
 * Two vocabularies, one meaning (§2.6, rule 2): the kitchen word names the object and the engine's term names the concept. A tile gives
 * both ("spike · queue"), and the mirror, the debrief and the claims lead with the engine's.
 */
import type { Mechanism, Place, Scenario } from '@es/sim/lifecycle'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Hand-offs                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface MechanismWords {
  /** The kitchen's word for the hand-off: what the ticket goes through. */
  readonly kitchen: string
  /** The engine's term, spelled out for a reader who is not looking at the tile. */
  readonly engine: string
  /** What the mechanism does, in a clause, for the legend and for assistive technology. */
  readonly does: string
}

/**
 * The seven hand-offs of GAMES.md §2.6 (spike, window, shelf, dumbwaiter, call, "Heard!", halves) and the work a pair of hands does where
 * the ticket already stands. The dumbwaiter goes down to the line (a host-to-device copy) or comes up from it (device to host).
 */
export const MECHANISM_WORDS: Readonly<Record<Mechanism, MechanismWords>> = {
  call: { kitchen: 'hands at work', engine: 'call', does: 'work done where the ticket already stands' },
  queue: { kitchen: 'spike', engine: 'queue', does: 'a buffer between two threads, or between two steps of one' },
  ipc: { kitchen: 'ticket window', engine: 'IPC', does: 'a hop between processes, over a socket' },
  shm: { kitchen: 'window shelf', engine: 'shared memory', does: 'a hop between processes, through memory both reach' },
  h2d: { kitchen: 'dumbwaiter down', engine: 'host-to-device copy', does: 'a copy from the host down to the GPU' },
  d2h: { kitchen: 'dumbwaiter up', engine: 'device-to-host copy', does: 'a copy from the GPU up to the host' },
  launch: { kitchen: 'call to the line', engine: 'launch', does: 'work handed to the GPU, which runs it there' },
  collective: { kitchen: 'halves across', engine: 'collective', does: 'a hop between the GPUs of two ranks' },
  sync: { kitchen: '"Heard!"', engine: 'sync', does: 'the host waits until the GPU has called back' },
}

/** The order the legend lists the hand-offs in: the ticket's way down the house and back. */
export const MECHANISM_ORDER: readonly Mechanism[] = ['ipc', 'shm', 'queue', 'call', 'h2d', 'launch', 'collective', 'd2h', 'sync']

/**
 * The mark each hand-off has, drawn on the design system's 24-unit grid: strokes only, one weight (2), round caps and joins, in
 * whatever colour the mark is set in (`currentColor` in the DOM, an ink role in the drawing). A mark is a few paths. None of them is a
 * categorical glyph (a plain triangle, circle, diamond, square, ring or hexagon): the board colours are the only code (§2.6, rule 6),
 * and a hand-off is told by its drawn object and by its word, never by a colour.
 */
export const GLYPHS: Readonly<Record<Mechanism, readonly string[]>> = {
  // A pencil: the hands at work writing the order (tokenizing, scheduling, naming the plates).
  call: ['M5 19.5l1.1-4.3L16.4 4.9a1.7 1.7 0 0 1 2.4 0l.3.3a1.7 1.7 0 0 1 0 2.4L8.8 17.9z', 'M14.6 6.7l2.7 2.7'],
  // A spike through a ticket, on its base.
  queue: ['M12 3.5v15', 'M6.5 20.5h11', 'M7.5 9h9v5.5h-9z'],
  // A ticket window: the frame, the sill, and the opening.
  ipc: ['M4 4.5h16v15H4z', 'M4 14.5h16', 'M8 9.5h8v5H8z'],
  // A ticket on a shelf both floors reach, on its brackets.
  shm: ['M3 13h18', 'M6.5 13v6.5', 'M17.5 13v6.5', 'M9.5 6.5h5v6.5h-5z'],
  // The dumbwaiter: a car in its shaft, going down.
  h2d: ['M5 3v18', 'M19 3v18', 'M8.5 6.5h7v6h-7z', 'M9.5 16l2.5 2.5 2.5-2.5'],
  // ...and coming up.
  d2h: ['M5 3v18', 'M19 3v18', 'M8.5 11.5h7v6h-7z', 'M9.5 8l2.5-2.5L14.5 8'],
  // A call: a shout across the kitchen to the line.
  launch: ['M4 9.5v5h3.5l6 4.5V5l-6 4.5z', 'M16.8 9.2a4.2 4.2 0 0 1 0 5.6', 'M19.6 6.4a8.2 8.2 0 0 1 0 11.2'],
  // Two halves of a dish, passed across.
  collective: ['M10.8 4.5a7.5 7.5 0 0 0 0 15z', 'M13.2 4.5a7.5 7.5 0 0 1 0 15z'],
  // A boom gate: the post, the arm across, and its stripes. The hands that asked stop here until the line calls back.
  sync: ['M6 21V4', 'M6 8.5h14', 'M10.5 6.5v4', 'M14.5 6.5v4', 'M18.5 6.5v4'],
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Floors                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The floors of the house, from the dining room at the top to the line at the bottom (GAMES.md §2.6): the client; the host stand, which
 * is the API server; the order desk, where a tokenizer or a detokenizer works as a process of its own; the pass, where the expo (the
 * scheduler, the engine core) works; the cooks' floors, one for each worker rank; and the line, the GPU, whose burners are its streams.
 * A program that is one process end to end, as nano-vllm's offline library is, is the whole kitchen on one floor.
 */
export type FloorKind = 'dining' | 'host' | 'desk' | 'pass' | 'cooks' | 'kitchen' | 'line'

export const FLOOR_KINDS: readonly FloorKind[] = ['dining', 'host', 'desk', 'pass', 'cooks', 'kitchen', 'line']

export const FLOOR_NAMES: Readonly<Record<FloorKind, string>> = {
  dining: 'The dining room',
  host: 'The host stand',
  desk: 'The order desk',
  pass: 'The pass',
  cooks: "The cooks' floor",
  kitchen: 'The whole kitchen',
  line: 'The line',
}

/** The floor a process stands on, from its name. A process the table does not know is a cook's floor. */
export function floorKindOfProcess(process: string): FloorKind {
  if (process === 'client') return 'dining'
  if (process === 'api-server') return 'host'
  if (/^(?:de)?tokenizer/.test(process)) return 'desk'
  if (process === 'engine-core' || /^scheduler(?:-|$)/.test(process)) return 'pass'
  if (process === 'main') return 'kitchen'
  return 'cooks'
}

/** The floor a place is on: a GPU is always the line, whichever process owns it. */
export const floorKindOf = (place: Place): FloorKind => (place.device === 'gpu' ? 'line' : floorKindOfProcess(place.process))

/** A place's key, for maps and sets. */
export const placeKey = (p: Place): string => `${p.process}|${p.thread}|${p.device}|${p.rank}`

/**
 * A place in the engine's own terms, for a tile: the process and the thread (`engine-core · input-thread`), and for a GPU the stream of
 * the process that owns it. The rank rides along where it is not the first.
 */
export function placeName(p: Place): string {
  if (p.device === 'gpu') return `GPU of ${p.process}${p.rank > 0 ? ` (rank ${p.rank})` : ''}`
  return `${p.process} · ${p.thread}${p.rank > 0 ? ` (rank ${p.rank})` : ''}`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What a request asks                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The five things about a request that the graded level varies besides the engine (GAMES.md §5: streaming × TP × abort × prefix hit × n). */
export type RequestFlag = 'streaming' | 'tp' | 'abort' | 'prefixHit' | 'n'

export const REQUEST_FLAGS: readonly RequestFlag[] = ['streaming', 'tp', 'abort', 'prefixHit', 'n']

/**
 * A value of a flag as a noun phrase that follows "a request with": the words a sentence uses to say what a stage needs and what this
 * request has. They carry no digit, because a sentence carries none (the page's counts are Readouts that tag every number).
 */
export function requestWords(flag: RequestFlag, value: Scenario[RequestFlag]): string {
  switch (flag) {
    case 'streaming':
      return value === true ? 'a streamed answer' : 'a whole answer, not streamed'
    case 'tp':
      return value === 2 ? 'two ranks' : 'one rank'
    case 'abort':
      return value === true ? 'a client that leaves mid-stream' : 'a client that stays to the end'
    case 'prefixHit':
      return value === true ? 'a prefix hit' : 'no prefix hit'
    case 'n':
      return value === 2 ? 'two samples' : 'one sample'
  }
}
