/**
 * TR8's predictions that are revealed at commit (D-067): each question is a toy run or a tool's arithmetic with numbers of its own, and the
 * levels of the broken benchmark draw their cases from the seed. Each answer is the benchmark model's own rule on those numbers, and takes no run.
 * tests/play/predictions.test.ts holds each to the figure that tests/content/tr8-demos.ts computes.
 */
import { latencyPercentiles } from '@es/sim/bench'
import { figure } from './figure'
import type { Commit } from './types'

/** The p99 of the toy run: 200 requests due 500 ms apart, one client that waits for each reply, and a freeze of 2 s as the third is sent. */
function toyP99(): { fromSend: number; fromDue: number } {
  const fromSend: number[] = []
  const fromDue: number[] = []
  let free = 0
  for (let i = 0; i < 200; i++) {
    const due = 500 * i
    const sent = Math.max(due, free)
    const reply = sent + (i === 2 ? 2100 : 100)
    free = reply
    fromSend.push(reply - sent)
    fromDue.push(reply - due)
  }
  return { fromSend: latencyPercentiles(fromSend)?.p99Us ?? NaN, fromDue: latencyPercentiles(fromDue)?.p99Us ?? NaN }
}

/** The requests of a run of `n` that lie beyond its p99 by nearest rank. */
const beyondP99 = (n: number): number => latencyPercentiles(Array.from({ length: n }, (_, i) => i + 1))?.beyondP99 ?? NaN

export const COMMITS: Readonly<Record<string, Commit>> = {
  'tr8.l1.p1': {
    says: ['200 requests', 'every 500 ms', 'freezes for 2 s', 'started at each send'],
    working: [
      'The client waits for each reply, so a request is sent when it is due or when the last reply came, whichever is later.',
      'The frozen request takes 2,100 ms from its send. Every request after it is sent late, as soon as the freeze ends, and each is answered in 100 ms, so from its send it takes 100 ms too.',
      `One request of 200 is slow, and the p99 by nearest rank is the 198th of 200 in order, which is ${figure(toyP99().fromSend)} ms. A clock started at each send never sees the wait, and one started at each request's due time would report ${figure(toyP99().fromDue)} ms.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => toyP99().fromSend,
  },
  'tr8.l2.p1': {
    says: ['250 requests', 'nearest rank'],
    working: [
      'By nearest rank the p99 of 250 values is the one at rank ⌈0.99 × 250⌉ = 248 in order.',
      `${figure(250)} − 248 = ${figure(beyondP99(250))} requests lie beyond it.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => beyondP99(250),
  },
  'tr8.l3.p1': {
    says: ['10 a second', '8 requests in flight', '1.2 s'],
    working: [
      'A cap of 8 requests in flight, each held for 1.2 s, lets the client send 8 ÷ 1.2 requests a second at most.',
      `That is ${figure(8 / 1.2)} requests a second, which is under the 10 a second asked for, so the cap sets the rate.`,
      `The run sends ${figure(Math.min(10, 8 / 1.2))} requests a second.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => Math.min(10, 8 / 1.2),
  },
  'tr8.l4.p1': {
    says: ['1,000 requests', '600', '100 s'],
    working: [
      'The tool divides the requests that met both objectives by the duration of the whole run, and the whole run lasts until the last reply, not until the arrival window closes.',
      `${figure(600)} ÷ ${figure(100)} s = ${figure(600 / 100)} requests a second.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => 600 / 100,
  },
}
