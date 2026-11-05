/**
 * Compose (GAMES.md §3, "Compose and In production"; kernelspace's play sequence): the learner's levers for every stage of a level, as a
 * policy that compiles to the pinned engines' configuration, and that runs on the level's own seed and on fresh ones beside the house.
 *
 * The configuration is printed in the engines' own terms, and only where a claim holds the term: vLLM's `--no-async-scheduling`,
 * `compilation_config`'s `cudagraph_mode` and `cudagraph_capture_sizes`, `--max-num-seqs` and `--max-num-batched-tokens`, and
 * `VLLM_USE_V2_MODEL_RUNNER`; SGLang's `--disable-overlap-schedule`. Where an engine has no switch for a lever (the mask's overlap is how
 * vLLM's engine core is built, not a flag), the compiled policy says so instead of inventing one.
 */
import type { Seed } from '@es/sim/core'
import { buildFullLevel, defaultLevers } from './levels'
import { nightOf } from './night'
import { meetsBar } from './session'
import type { FullLevelId, Levers, StageWorld } from './types'

/** The configuration a policy compiles to: a line of each engine's for each lever the level has, and what has no flag. */
export interface Compiled {
  readonly vllm: readonly string[]
  readonly sglang: readonly string[]
  readonly notes: readonly string[]
}

/** The policy's levers, folded over its stages: what the panel set last on each. */
export function compile(stages: readonly StageWorld[], policy: readonly Levers[]): Compiled {
  const vllm: string[] = []
  const sglang: string[] = []
  const notes: string[] = []
  const first = stages[0]
  vllm.push(`--max-num-seqs ${first.slots}`, `--max-num-batched-tokens ${first.budget}`)
  const seen = new Set<string>()
  stages.forEach((stage, i) => {
    const levers = policy[i]
    const defaults = defaultLevers(stage.slots, stage.budget)
    for (const lever of stage.levers) {
      const key = `${lever}:${JSON.stringify(lever === 'capture' ? levers.captureSizes : lever === 'graphMode' ? levers.graphMode : lever === 'runner' ? levers.runner : lever === 'async' ? levers.async : levers.maskOverlap)}`
      if (seen.has(key)) continue
      seen.add(key)
      if (lever === 'async') {
        if (!levers.async) {
          vllm.push('--no-async-scheduling')
          sglang.push('--disable-overlap-schedule')
        } else notes.push('Async scheduling on is the default of both engines: no flag.')
      } else if (lever === 'graphMode') {
        const sizes = levers.captureSizes.join(', ')
        vllm.push(`--compilation-config '{"cudagraph_mode": "${levers.graphMode}"${levers.captureSizes === defaults.captureSizes ? '' : `, "cudagraph_capture_sizes": [${sizes}]`}}'`)
      } else if (lever === 'capture') {
        vllm.push(`--compilation-config '{"cudagraph_capture_sizes": [${levers.captureSizes.join(', ')}]}'`)
        notes.push("SGLang keys its decode graphs by padded batch size from its own bucket list; its own setting for the list is not among this course's claims.")
      } else if (lever === 'runner') {
        if (levers.runner === 'v1') vllm.push('VLLM_USE_V2_MODEL_RUNNER=0 (in the environment)')
        else notes.push('MRV2 is vLLM\'s default runner at the pin: no flag. SGLang has no second runner to choose.')
      } else if (lever === 'maskOverlap') {
        notes.push(
          levers.maskOverlap
            ? "vLLM's engine core writes the bitmask after it launches the forward: the overlap is how the engine is built, not a flag. SGLang delays the sample instead."
            : 'Writing the bitmask after the forward has no flag in either engine: it is the model\'s counterfactual, to show what the overlap hides.',
        )
      }
    }
  })
  return { vllm, sglang, notes }
}

/** One seed's verdict: each stage's night served with the policy, against the house's. */
export interface ComposeRow {
  readonly seed: Seed
  readonly stages: readonly { readonly id: string; readonly title: string; readonly metric: number | null; readonly house: number; readonly ok: boolean }[]
  readonly ok: boolean
}

/**
 * The policy served on each seed (GAMES.md §2.1): every stage of the level on that seed with the policy's levers for it, its night
 * against the house's on the same seed. A configuration the engine refuses there scores no night.
 */
export function composeRun(id: FullLevelId, policy: readonly Levers[], seeds: readonly Seed[]): ComposeRow[] {
  return seeds.map((seed) => {
    const level = buildFullLevel(id, seed)
    const stages = level.stages.map((stage, i) => {
      const night = nightOf(stage, policy[i] ?? stage.house)
      return { id: stage.id, title: stage.title, metric: night === null ? null : night.metric, house: stage.houseMetric, ok: night !== null && meetsBar(stage, night.metric) }
    })
    return { seed, stages, ok: stages.every((stage) => stage.ok) }
  })
}
