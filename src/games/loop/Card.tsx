import { Readout } from '@/design/components/Readout'

/*
 * The step loop's notional-machine card, on the page (A§5.9, D-012): what the front page's world models, what it ignores and what it was
 * calibrated against. The full card is content/cards/trace-room-steploop.md, which names the step-loop model and its tick card.
 * The tick costs are the card's own (packages/sim/steploop `TICK_CARD`) and a world's invention, so each says synthetic.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-loop-card="">
      <p>
        <strong>Models.</strong> One engine core's loop, on two lanes: the CPU schedules a step and reads it back, and the GPU runs the forward pass. A step costs the
        GPU the same for one request or four, a finished request frees its slot when the CPU reads the step back, and with async scheduling the CPU plans the next step
        during this one, so a finished request rides one more step as a ghost token.
      </p>
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>The CPU schedules a step</dt>
        <dd>
          <Readout value={2} unit="ticks" tag="synthetic" size="sm" />
        </dd>
        <dt>The GPU runs the forward pass</dt>
        <dd>
          <Readout value={4} unit="ticks" tag="synthetic" size="sm" />
        </dd>
        <dt>More, when it admits a request for the first time</dt>
        <dd>
          <Readout value={1} unit="ticks" tag="synthetic" size="sm" />
        </dd>
        <dt>The CPU reads the step back</dt>
        <dd>
          <Readout value={1} unit="ticks" tag="synthetic" size="sm" />
        </dd>
      </dl>
      <p>
        <strong>Ignores.</strong> A real engine and real hardware. The ticks are made up, every step costs the same, each request asks for made-up output tokens the CPU cannot
        see, and there is no memory limit, no preemption, no CUDA graph and no host variance.
      </p>
      <p>
        <strong>Calibrated against.</strong> Nothing yet. The real engine is the judge: the course checks the same ideas on vLLM and SGLang.
      </p>
    </div>
  )
}
