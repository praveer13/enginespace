// How an engine's path is written down: places, citations, and a builder that carries the request from one stage to the next, so
// that every stage starts where the one before it ended by construction. The engines' files (engines/*.ts) are lists of `go` calls.

import type { Mechanism, Place, SourceRef, StageDef } from './types'

/** A place on the host: a thread of a process. */
export const host = (process: string, thread: string, rank = 0): Place => ({ process, thread, device: 'host', rank })

/** A GPU, as the process that owns it sees it: one stream, and the rank of the device. */
export const gpu = (process: string, rank = 0): Place => ({ process, thread: 'cuda-stream', device: 'gpu', rank })

/** The repository and the commit that an engine's citations name: the lock's commit for the engine's pin (tests compare them). */
export interface Pin {
  readonly repo: string
  readonly ref: string
}

/** A citation maker bound to one pin: `cite(path, symbol, line, quote)`. */
export function citer(pin: Pin): (path: string, symbol: string, line: number, quote: string) => SourceRef {
  return (path, symbol, line, quote) => ({ repo: pin.repo, ref: pin.ref, path, symbol, line, quote })
}

export interface PathBuilder {
  /** Where the request is now: the `to` of the last stage, or the entry place. */
  readonly at: Place
  /**
   * Adds a stage that starts where the request is and ends at `to`. A stage that does its work in place has `to` equal to `at`.
   * The id is unique in the path.
   */
  go(id: string, mechanism: Mechanism, label: string, to: Place, source: SourceRef, state?: string): void
  build(): readonly StageDef[]
}

export function pathBuilder(entry: Place): PathBuilder {
  const stages: StageDef[] = []
  let at = entry
  return {
    get at() {
      return at
    },
    go(id, mechanism, label, to, source, state) {
      if (stages.some((s) => s.id === id)) throw new RangeError(`the stage "${id}" is already in the path`)
      stages.push({ id, mechanism, label, from: at, to, source, ...(state === undefined ? {} : { state }) })
      at = to
    },
    build() {
      return stages.slice()
    },
  }
}
