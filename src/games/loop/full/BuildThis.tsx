import type { FullLevelId } from '@es/play/loop/full/types'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'

/*
 * Build this (GAMES.md §2.2 "Build", §3 "Prove, Keep"): what to run on a real engine to see the level's mechanism there. TR2 has no GPU
 * stage of its own: TR3's profiling lab runs the step loop's experiments (`tr3.profile.s4` toggles async scheduling; `tr3.profile.s5`
 * measures SGLang's decode-graph cliff), and it arrives with W2. The local grader checks those runs, and nothing here grades a GPU number.
 */

const BUILD: Readonly<Record<FullLevelId, { readonly title: string; readonly body: string }>> = {
  async: {
    title: 'Hide the expo\'s work on a real engine',
    body: "On vLLM v0.33.0, serve the same small model with and without --no-async-scheduling at a batch of 8 and profile a step of each: the gap between two forwards is the dark stretch this level drew. TR3's lab runs it (tr3.profile.s4), with W2.",
  },
  graphs: {
    title: 'Find where decode leaves the graph',
    body: "On a 24 GB card, SGLang v0.5.23's decode graphs stop at a batch of 48 below tensor-parallel size 4. Run decode at 48 and at 49 and compare: the step past the largest mold is called dish by dish. TR3's lab measures it (tr3.profile.s5), with W2.",
  },
  mrv2: {
    title: 'Set the runner, and read the step',
    body: 'Serve the small model with VLLM_USE_V2_MODEL_RUNNER=0 and without it, and compare the host time of a step in each trace: the share that input preparation on the GPU takes off the expo. TR3\'s lab profiles both, with W2.',
  },
  mask: {
    title: 'Time the allergy card',
    body: "Serve requests with a JSON schema and read where the bitmask's fill falls in the step's trace, against the forward. TR6's mask-overlap timeline (W1-T30) draws vLLM's and SGLang's answers on one axis.",
  },
}

export function BuildThis({ level }: { level: FullLevelId }) {
  const build = BUILD[level]
  return (
    <Ticket as="section" width="full" hole={false} titleAs="h3" title={build.title} data-full-build="">
      <p>{build.body}</p>
      <p>
        <TextLink to="/m/tr2">TR2: the step loop</TextLink>
      </p>
    </Ticket>
  )
}
