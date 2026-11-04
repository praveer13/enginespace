// The benchmark client and its run (ARCHITECTURE §5.6): who sends what, and when, against the coarse server.
//
// Every request keeps two times, the one the harness meant to send it (`dueUs`) and the one it did (`sentUs`).
//   - An open-loop client sends on schedule whatever the server does, so `sentUs = dueUs`. Its own cost per request
//     (`clientCostUs`) is the only thing that can hold it back, and a client that is slower than its schedule falls behind it.
//   - A closed-loop client waits for a reply before it sends again, so a server that stalls holds its clients back, and the
//     requests that fell due meanwhile are sent late. The latency the harness measures from the actual send leaves that wait out.
//     This is coordinated omission, and here it happens by construction (wrk2's README; vllm B2 for `--max-concurrency`).
// The log keeps both, and the course measures from the due time (ASSESSMENT B5).
//
// One client thread sends everything, so sends are at least `clientCostUs` apart, in the order the requests were handed out.

import { assertSeed } from '../core/rng'
import type { Seed, Us } from '../core/types'
import { planBench } from './plan'
import { checkServer, runServer } from './server'
import type { Feed, ServerArrival, ServerModel, ServerRun } from './server'
import type { BenchRow, BenchRun, BenchSpec } from './types'

/**
 * Runs `spec` under `seed` against `server` until every request that was sent has finished, and returns the client's log. Nothing is
 * cut at the end of the arrival window: requests that fell due inside it finish in the drain tail, which the summary accounts for.
 */
export function runBench(seed: Seed, spec: BenchSpec, server: ServerModel): BenchRun {
  assertSeed(seed)
  const plan = planBench(seed, spec)
  checkServer(server)

  const cost = spec.clientCostUs ?? 0
  const count = plan.reqs.length
  const due: Us[] = []
  const sent: Us[] = []
  const client: (number | null)[] = []
  /** When the client thread can start the next send. */
  let threadFreeUs: Us = 0

  /** Hands request `id` to `who` (null for an open loop) when it is ready to send at `readyUs`; the thread may make it later still. */
  const send = (id: number, readyUs: Us, who: number | null): ServerArrival => {
    const r = plan.reqs[id]
    const at = Math.max(readyUs, threadFreeUs)
    threadFreeUs = at + cost
    due[id] = r.dueUs ?? readyUs
    sent[id] = at
    client[id] = who
    return { key: id, atUs: at, promptTokens: r.promptTokens, outputTokens: r.outputTokens, cachedTokens: r.cachedTokens }
  }

  let served: ServerRun
  /** Requests handed out: all of them, unless a closed loop without a schedule ran out of window first. */
  let offered = count
  if (spec.arrivals.kind !== 'closed') {
    // Open loop: every send is known now.
    served = runServer(
      server,
      plan.reqs.map((r) => send(r.id, r.dueUs ?? 0, null)),
    )
  } else {
    const { clients, thinkUs } = spec.arrivals
    /** The next request to hand out, which is also how many have been. */
    let next = 0
    let windowOver = false
    /**
     * Gives the next request to client `who`, free from `freeAtUs`. Null when none is left to give, or the loop has no schedule and
     * the window is over: a pure closed loop sends nothing at or after `durationUs`. Clients free up in the order of their replies,
     * so once one is ready too late, every later one is.
     */
    const assign = (who: number, freeAtUs: Us): ServerArrival | null => {
      if (windowOver || next >= count) return null
      const r = plan.reqs[next]
      const ready = r.dueUs === null ? freeAtUs : Math.max(r.dueUs, freeAtUs)
      if (r.dueUs === null && ready >= spec.durationUs) {
        windowOver = true
        return null
      }
      return send(next++, ready, who)
    }
    const initial: ServerArrival[] = []
    for (let who = 0; who < clients; who++) {
      const a = assign(who, 0)
      if (a !== null) initial.push(a)
    }
    const onFinish = (key: number, doneUs: Us, feed: Feed): void => {
      const who = client[key]
      if (who === null) throw new Error('internal: a closed-loop request has no client')
      const a = assign(who, doneUs + thinkUs)
      if (a !== null) feed.arrive(a)
    }
    served = runServer(server, initial, onFinish)
    offered = next
  }

  const rows: BenchRow[] = []
  for (let id = 0; id < offered; id++) {
    const r = plan.reqs[id]
    const s = served.reqs[id]
    rows.push({ id, client: client[id], dueUs: due[id], sentUs: sent[id], firstUs: s.firstUs, doneUs: s.doneUs, promptTokens: r.promptTokens, outputTokens: r.outputTokens })
  }
  return { seed, origin: plan.origin, rows, spec, endUs: served.endUs, steps: served.steps, gpuBusyUs: served.gpuBusyUs }
}
