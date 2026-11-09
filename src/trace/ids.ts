/*
 * The ids of the specimen tapes (WORLD §3.5): `/trace-room/synthetic-<seed>` is the step-loop model's night for that seed. A page
 * reads them to know whether it has a tape to show, so they live apart from the model that makes it, and the page's own chunk stays
 * small until a tape is asked for.
 */
import type { Seed } from '@es/sim/core'

const SYNTHETIC_ID = /^synthetic-(\d{1,10})$/

/** The seed a trace id names (`synthetic-7`), or null for any other id. */
export function syntheticSeed(id: string | undefined): Seed | null {
  const match = id === undefined ? null : SYNTHETIC_ID.exec(id)
  if (match === null) return null
  const seed = Number(match[1])
  return seed <= 0xffff_ffff ? seed : null
}

export const syntheticId = (seed: Seed): string => `synthetic-${seed}`
