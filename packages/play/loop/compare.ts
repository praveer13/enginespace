/**
 * Compare (GAMES.md §3.1 beat 4, §2.6 "Compare"): the same night served three ways, side by side, from the sim.
 *
 * Firing the rail as a set (static batching), refilling clips (continuous batching) and refilling while the next call is written
 * during the fire (continuous batching with overlap, par) are `runStepLoop` runs of the night's seed, so each is the sim's own number
 * and not a story. This file turns a run into the fires that `strip.ts` draws, and names the services.
 */
import type { Seed } from '@es/sim/core'
import type { StepLoopRun } from '@es/sim/steploop'
import { SLOTS, services } from './levels'
import type { FireView, PlaceView } from './types'

/** A service of the night: what it is called, and its run. */
export interface Service {
  readonly id: 'fired-as-set' | 'refill' | 'par'
  /** What it does, in a few words, and the engine's term, which leads where it is printed. */
  readonly name: string
  readonly term: string
  readonly run: StepLoopRun
}

/** The fires of a sim run, as the layout draws them. The sim records how many rows a step had and how many were binned, not which clip held which ticket, so plates come first, then binned plates, then empty places. */
export function firesOfRun(run: StepLoopRun, slots: number = SLOTS): FireView[] {
  const forwards = run.lanes['gpu-stream']
  return run.steps.map((step, index): FireView => {
    const forward = forwards[index]
    const places: PlaceView[] = [
      ...Array.from({ length: step.seqs - step.ghostSeqs }, (): PlaceView => ({ state: 'plate', req: null })),
      ...Array.from({ length: step.ghostSeqs }, (): PlaceView => ({ state: 'binned', req: null })),
      ...Array.from({ length: Math.max(slots - step.seqs, 0) }, (): PlaceView => ({ state: 'empty', req: null })),
    ]
    return { index, startUs: forward.startUs, endUs: forward.endUs, places, admits: step.prefillSeqs, bubbleUs: step.bubbleUs, ghosts: step.ghostSeqs, onLine: false }
  })
}

/** The three schedulers of the compare view, from a batch run as a set to the reference run. */
export function compareServices(seed: Seed): Service[] {
  const s = services(seed)
  return [
    { id: 'fired-as-set', name: 'the batch runs as a set, then the next one starts', term: 'Static batching', run: s.firedAsSet },
    { id: 'refill', name: 'a slot is refilled the moment it frees', term: 'Continuous batching', run: s.refillAlone },
    { id: 'par', name: 'a slot is refilled at once, and the next step is planned while this one runs', term: 'Continuous batching with async scheduling (the reference)', run: s.par },
  ]
}
