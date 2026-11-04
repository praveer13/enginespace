import { Readout } from '@/design/components/Readout'

/*
 * Service's notional-machine card, on the page (A§5.9, D-012): what the front page's world models, what it ignores and what it was
 * calibrated against. The full card is content/cards/trace-room-steploop.md, which names the step-loop model and its tick card.
 * The tick costs are the card's own (packages/sim/steploop `TICK_CARD`) and a world's invention, so each says synthetic.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-loop-card="">
      <p>
        <strong>Models.</strong> One engine core's loop, on two lanes: the expo (the CPU) plans a fire and reads it back, and the line (the GPU) cooks it. A fire costs the
        line the same whether it holds one ticket or four, a ticket that ends frees its clip when the expo reads the fire back, and with overlap the expo writes the next
        call during the fire, so a ticket that ended still rides one more fire and that course is binned.
      </p>
      <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>The expo plans a fire</dt>
        <dd>
          <Readout value={2} unit="ticks" tag="synthetic" size="sm" />
        </dd>
        <dt>The line cooks it</dt>
        <dd>
          <Readout value={4} unit="ticks" tag="synthetic" size="sm" />
        </dd>
        <dt>More, when it hangs a ticket for the first time</dt>
        <dd>
          <Readout value={1} unit="ticks" tag="synthetic" size="sm" />
        </dd>
        <dt>The expo reads it back</dt>
        <dd>
          <Readout value={1} unit="ticks" tag="synthetic" size="sm" />
        </dd>
      </dl>
      <p>
        <strong>Ignores.</strong> A real engine and real hardware. The ticks are made up, every fire costs the same, a ticket's table asks for a number of courses drawn from
        a made-up menu, and the expo cannot see how many. There is no memory limit, no preemption, no CUDA graph and no host variance.
      </p>
      <p>
        <strong>Calibrated against.</strong> Nothing yet. The real engine is the judge: the course checks the same ideas on vLLM and SGLang.
      </p>
    </div>
  )
}
