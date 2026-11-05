import { useMemo } from 'react'
import { useClaims } from '@/content/load'
import { ClaimChip } from '@/content/render/ClaimChip'
import { renderEnv, todayIso } from '@/content/render/model'
import { Ticket } from '@/design/components/Ticket'

/*
 * In production (GAMES.md §11 "Core loop", step 6): the flags of the real tools that would have produced a number the court admits. They
 * are cited as claims, each with its source and the day it was read, because an upstream fact belongs to a pin and not to this page
 * (AGENTS.md, "Pins"): a finite `--request-rate` draws the arrivals open-loop, `--max-concurrency` records the wait for a permit as
 * `client_queue_time`, and SGLang's `--goodput` counts the requests that meet every objective.
 */

const FLAGS = [
  {
    flag: 'vllm bench serve --request-rate N --burstiness 1',
    says: 'An open loop at a rate, with Poisson gaps, so the schedule does not wait for replies. The default rate is infinity, which is a burst.',
    claims: ['vllm.bench.arrivals', 'vllm.bench.request-rate-default'],
  },
  {
    flag: 'vllm bench serve --max-concurrency N',
    says: 'A cap on orders in flight is a closed loop in disguise. The tool records the wait for a permit as client_queue_time, which a latency timed from the send leaves out.',
    claims: ['vllm.bench.max-concurrency-closed-loop', 'vllm.bench.client-queue-time'],
  },
  {
    flag: 'python -m sglang.bench_serving --goodput ttft:500 tpot:50',
    says: 'A rate of requests that meet every objective, in place of a mean and a tail alone.',
    claims: ['sglang.bench.goodput'],
  },
] as const

export function Production() {
  const wanted = FLAGS.flatMap((item) => item.claims)
  const claims = useClaims(true)
  const env = useMemo(() => renderEnv([], claims.status === 'ready' ? claims.value : null, todayIso()), [claims])
  return (
    <Ticket as="section" width="full" hole={false} titleAs="h3" title="The flags that would have made it admissible">
      <p>
        The browser world is a model, and the real tools are the judge. These are the flags that bear on the flaws you just met, as the tools stood at the pins on the day each claim was read.
      </p>
      {claims.status === 'loading' ? <p role="status">Reading the sources…</p> : null}
      <ul className="es-bench-flagsets" data-claims={wanted.length}>
        {FLAGS.map((item) => (
          <li key={item.flag}>
            <p>
              <code>{item.flag}</code>
            </p>
            <p>{item.says}</p>
            <ul className="es-bench-instances">
              {item.claims.map((id) => (
                <li key={id}>
                  <ClaimChip id={id} env={env} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Ticket>
  )
}
