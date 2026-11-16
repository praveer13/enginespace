/**
 * Request path's words and marks (REDESIGN §2.7, §3.6): the engine's name for each mechanism, the name of each process, and the mark each
 * mechanism has. All of it is data, so the swimlane, the stage list, the table and the result say the same things.
 *
 * What a learner reads is the engine's term. A stage list tile names its mechanism as TR1 lesson 1 names it, one of five, with the kind where
 * one of them splits ("IPC · socket", "copy · host to device"). The ids (`FloorKind`, `Mechanism`, the stage ids) stay as they are: the 3D
 * scene and a learner's stored runs read them.
 */
import type { Mechanism, Place, Scenario, SourceRef } from '@es/sim/lifecycle'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Hand-offs                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface MechanismWords {
  /**
   * The tile's word: which of TR1's five mechanisms (compute, a queue, IPC, a copy, a sync) the hand-off is, and, where one of the five
   * splits, which kind of it ("IPC · socket", "copy · host to device"). It is what a stage's tile, the stage list and the key lead with.
   */
  readonly tile: string
  /** The engine's term, spelled out for a reader who is not looking at the tile. */
  readonly engine: string
  /** What the mechanism does, in a clause, for the legend and for assistive technology. */
  readonly does: string
}

/** Each mechanism in words: the tile's, the engine's term, and what it does. A copy goes to the GPU (host to device) or comes back (device to host). */
export const MECHANISM_WORDS: Readonly<Record<Mechanism, MechanismWords>> = {
  call: { tile: 'compute · call', engine: 'call', does: 'work done where the request already is, on the host' },
  queue: { tile: 'queue', engine: 'queue', does: 'a buffer between two threads, or between two steps of one' },
  ipc: { tile: 'IPC · socket', engine: 'IPC', does: 'a hop between processes, over a socket' },
  shm: { tile: 'IPC · shared memory', engine: 'shared memory', does: 'a hop between processes, through memory both reach' },
  h2d: { tile: 'copy · host to device', engine: 'host-to-device copy', does: 'a copy from the host to the GPU' },
  d2h: { tile: 'copy · device to host', engine: 'device-to-host copy', does: 'a copy from the GPU back to the host' },
  launch: { tile: 'compute · launch', engine: 'launch', does: 'work handed to the GPU, which runs it there' },
  collective: { tile: 'compute · collective', engine: 'collective', does: 'a hop between the GPUs of two ranks' },
  sync: { tile: 'sync', engine: 'sync', does: 'the host waits until the GPU has finished' },
}

/** The order the legend lists the mechanisms in: a request's way from the client to the GPU and back. */
export const MECHANISM_ORDER: readonly Mechanism[] = ['ipc', 'shm', 'queue', 'call', 'h2d', 'launch', 'collective', 'd2h', 'sync']

/**
 * The mark each mechanism has, on the design system's 24-unit grid: strokes only, one weight (2), round caps and joins, in whatever colour
 * the mark is set in. None of them is a categorical glyph (a plain triangle, circle, diamond, square, ring or hexagon): those belong to the
 * colour code, and a mechanism is told by its mark and its word, never by a colour.
 */
export const GLYPHS: Readonly<Record<Mechanism, readonly string[]>> = {
  // A call: a function's parentheses round its argument.
  call: ['M9 4.5c-3.4 3.6-3.4 11.4 0 15', 'M15 4.5c3.4 3.6 3.4 11.4 0 15', 'M12 12h.01'],
  // A queue: three slots in a row, first in at the left.
  queue: ['M3 8.5h5v7H3z', 'M9.5 8.5h5v7h-5z', 'M16 8.5h5v7h-5z'],
  // IPC over a socket: two ends joined across a process boundary.
  ipc: ['M2.5 8.5h6v7h-6z', 'M15.5 8.5h6v7h-6z', 'M8.5 12h7', 'M12 3.5v3', 'M12 17.5v3'],
  // Shared memory: one buffer that stands across the boundary, so both sides reach it.
  shm: ['M12 3v18', 'M5.5 8h13v8h-13z'],
  // A copy from the host down to the GPU.
  h2d: ['M4 4h16', 'M12 7v12', 'M7.5 14.5 12 19l4.5-4.5'],
  // A copy from the GPU back up to the host.
  d2h: ['M4 20h16', 'M12 17V5', 'M7.5 9.5 12 5l4.5 4.5'],
  // A launch: work handed on to run ahead, two chevrons.
  launch: ['M5 6l6 6-6 6', 'M12 6l6 6-6 6'],
  // A collective: the ranks swap what they hold.
  collective: ['M4 8h15', 'M16 5l3 3-3 3', 'M20 16H5', 'M8 13l-3 3 3 3'],
  // A sync: the host waits, as an hourglass does, until the GPU's work has run through.
  sync: ['M6.5 3.5h11', 'M6.5 20.5h11', 'M8 3.5 16 20.5', 'M16 3.5 8 20.5'],
}

/** A stage's name as code: the first identifier its label sets in backticks, or the label itself where it sets none. */
export function stageName(label: string): string {
  const code = /`([^`]+)`/.exec(label)
  return code === null ? label : code[1]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Floors                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The kinds of process a path visits, by id: the client; the API server; a tokenizer or detokenizer that is a process of its own; the
 * engine core (or a rank's scheduler); a worker for another rank; a program that is one process end to end (nano-vllm's offline library);
 * and the GPU, whose streams have a column of their own. The ids are the old drawing's and stay, since the 3D scene reads them.
 */
export type FloorKind = 'dining' | 'host' | 'desk' | 'pass' | 'cooks' | 'kitchen' | 'line'

export const FLOOR_KINDS: readonly FloorKind[] = ['dining', 'host', 'desk', 'pass', 'cooks', 'kitchen', 'line']

/** What the screen calls each kind of process: the engine's name (REDESIGN §2.7). A program that is one process end to end is "One process". */
export const FLOOR_NAMES: Readonly<Record<FloorKind, string>> = {
  dining: 'Client',
  host: 'API server',
  desk: 'Tokenizer process',
  pass: 'Engine core',
  cooks: 'Worker',
  kitchen: 'One process',
  line: 'GPU',
}

/** The kind of a process, from its id. A process the table does not know is a worker. */
export function floorKindOfProcess(process: string): FloorKind {
  if (process === 'client') return 'dining'
  if (process === 'api-server') return 'host'
  if (/^(?:de)?tokenizer/.test(process)) return 'desk'
  if (process === 'engine-core' || /^scheduler(?:-|$)/.test(process)) return 'pass'
  if (process === 'main') return 'kitchen'
  return 'cooks'
}

/** The kind of a place: a GPU is always the GPU, whichever process owns it. */
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

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words in a line                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The pieces of a text, alternating plain and code: the lifecycle model writes a symbol, a path or a place in backticks. */
export function splitCode(text: string): { code: boolean; text: string }[] {
  return text
    .split('`')
    .map((piece, index) => ({ code: index % 2 === 1, text: piece }))
    .filter((piece) => piece.text !== '')
}

/** The same line as plain words, for a live region or an accessible name: the backticks go, and the words stay. */
export const plain = (text: string): string => text.replaceAll('`', '')

/** A mechanism in words: one of TR1's five, and its kind where the five split (`IPC · socket`, `copy · host to device`). */
export const handoffWords = (mechanism: Mechanism): string => MECHANISM_WORDS[mechanism].tile

/** The permalink of a stage's line at the commit it is cited at (A§4.4, TR1's "every code reference is a pinned permalink"). */
export const permalink = (source: SourceRef): string => `https://github.com/${source.repo}/blob/${source.ref}/${source.path}#L${source.line}`
