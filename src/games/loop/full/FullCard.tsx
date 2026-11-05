import { hostPreset } from '@es/sim/host'
import { SMALL_CARD } from '@es/sim/steploop'
import { Readout } from '@/design/components/Readout'

/*
 * The full service's notional-machine card, on the page (A§5.9, D-012): what the world models, what it ignores and what calibrated it.
 * The full card is content/cards/trace-room-steploop.md. The cost cards' figures print as Readouts with their tags: the S5 fit's are
 * derived from kernelspace's report, the small model's are synthetic, and every host µs is estimated (WORLD §2.11).
 */
export function FullCard() {
  const mrv2 = hostPreset('mrv2').card
  const v1 = hostPreset('v1').card
  const model = SMALL_CARD.spec.model
  return (
    <div className="flex flex-col gap-3" data-full-card="">
      <p>
        <strong>Models.</strong> The engine core's step loop at vLLM v0.33.0, in µs on the model's clock: the scheduler, async scheduling, the five CUDA-graph modes and their
        downgrades, capture sizes and padding, both runners' dispatchers, the structured-output mask, and the two runners' host cards. Two cost cards price the line: "70B on
        H100", kernelspace's S5 fit at tensor-parallel size 4 with its per-sequence host term on the expo's side (D-044, proposed), and a small model on a 24 GB card, a napkin
        at the datasheet bound.
      </p>
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>The small model's layers</dt>
        <dd>
          <Readout value={model.layers} tag="synthetic" size="sm" />
        </dd>
        <dt>Its weights</dt>
        <dd>
          <Readout value={model.weightBytes / 1e9} digits={1} unit="GB" tag="synthetic" size="sm" />
        </dd>
        <dt>A kernel launched one by one (both runners)</dt>
        <dd>
          <Readout value={mrv2.launchPerKernelUs} unit="µs" tag="estimated" size="sm" />
        </dd>
        <dt>Kernels per layer, called one by one</dt>
        <dd>
          <Readout value={mrv2.kernelsPerLayer} tag="estimated" size="sm" />
        </dd>
        <dt>A graph replayed</dt>
        <dd>
          <Readout value={mrv2.graphReplayUs} unit="µs" tag="estimated" size="sm" />
        </dd>
        <dt>Inputs prepared, per token: MRV2, then V1</dt>
        <dd>
          <Readout value={mrv2.prepPerTokenUs} unit="µs" tag="estimated" size="sm" /> <Readout value={v1.prepPerTokenUs} unit="µs" tag="estimated" size="sm" />
        </dd>
        <dt>A bitmask row, by default</dt>
        <dd>
          <Readout value={mrv2.maskPerSeqUs} unit="µs" tag="estimated" size="sm" />
        </dd>
      </dl>
      <p>
        <strong>Ignores.</strong> S5's own list on the line, CUDA-graph padding among it (the model prices a padded step by giving S5 the padded batch, an extrapolation), host
        variance, the KV manager (no capacity limit and no preemption), capture time and graph memory as limits, and SGLang's own loop. The mold rack's budget of molds and the
        mask level's grammar weights are the levels' own [estimated].
      </p>
      <p>
        <strong>Calibrated against.</strong> S5's H100 row for the 70B card's line; nothing for the small card, which is synthetic; nothing yet for the host card, which W2-T22
        fits to the owner's traces. The real engine is the judge.
      </p>
    </div>
  )
}
