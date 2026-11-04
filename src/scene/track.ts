/*
 * The time track's context (time-axis.ts, TimeAxis.tsx): what the marks inside a TimeTrack read each frame while the clock
 * advances. The present sweeps forward, and every mark later than the swept present is cut off at it, so a new slab
 * extrudes out of the pass instead of popping in.
 */
import { createContext, useContext } from 'react'

export interface Track {
  readonly unitsPerTime: number
  /** True while the present is sweeping toward the new clock. */
  moving(): boolean
  /** The present as drawn this frame, as a z in the track's own frame. +∞ when still: nothing is cut. */
  presentZ(): number
  /** Where the current sweep started, as a z in the track's frame: marks nearer than it are the ones a sweep redraws. */
  sweepFromZ(): number
}

export const TrackContext = createContext<Track | null>(null)

/** The TimeTrack around this mark, or null outside one. */
export function useTrack(): Track | null {
  return useContext(TrackContext)
}
