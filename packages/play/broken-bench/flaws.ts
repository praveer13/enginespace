/**
 * The eleven flaws a report can have (GAMES.md §11 "Cases"): each flaw's name, what it means, what its
 * log shows, and the rule of evidence that corrects the number.
 *
 * The engine's term leads and its plain meaning follows it (GAMES.md §2.6, rule 2). The words are the game's copy, so they carry no
 * digit: a number on screen is a Readout that tags it, and the sentences here say "a handful" and "enough" where a figure would go.
 * The correction's kind is the corpus's own (`correctBench`, packages/sim/bench/broken.ts), so the debrief names the arithmetic that
 * the reference really did.
 */
import type { BenchFlaw, CorrectionKind } from '@es/sim/bench/broken-types'

export interface FlawFacts {
  readonly id: BenchFlaw
  /** The engine's term. */
  readonly term: string
  /** The flaw as a noun phrase in a sentence: "you named a warm cache". */
  readonly phrase: string
  /** What the flaw is, in one plain phrase: shown beside the flaw's name before the report is filed. */
  readonly means: string
  /** What the log shows when this is the flaw (GAMES.md §11's table). */
  readonly shows: string
  /** The rule of evidence that corrects the number, as a sentence. */
  readonly rule: string
  /** How the corrected number is found: from the log's rows, from the rows after the warm-up cut, or by running the benchmark again. */
  readonly how: CorrectionKind
}

/** In the request of `BENCH_FLAWS`: the control last. */
export const FLAW_FACTS: Readonly<Record<BenchFlaw, FlawFacts>> = {
  'closed-loop': {
    id: 'closed-loop',
    term: 'Closed loop past capacity',
    phrase: 'a closed loop past capacity',
    means: 'a fixed set of clients, each waiting for its reply before it sends again, so the load never exceeds what the server can finish',
    shows: 'the requests in flight never exceed the clients, and the log has no queue to show',
    rule: 'Offer the load the report is about on a schedule that does not wait for replies (an open loop), and time that.',
    how: 'rerun',
  },
  'coordinated-omission': {
    id: 'coordinated-omission',
    term: 'Coordinated omission',
    phrase: 'coordinated omission',
    means: 'a timer started at the send, so the waits while the server stalls never reach a latency',
    shows: 'sends slip behind their due times while the server stalls, and the waits in between are in no latency',
    rule: 'Time every request from when it was due. The waits a timer started at the send never saw go back in.',
    how: 'rows',
  },
  'client-queue-hidden': {
    id: 'client-queue-hidden',
    term: 'Client queue hidden',
    phrase: 'a client queue hidden by the timer',
    means: 'a timer that starts only once a concurrency cap lets a request out, so the wait in the client queue is not timed',
    shows: 'the timer starts only after a cap on concurrency lets a request out, so the wait for a permit is in no latency',
    rule: 'Time every request from when it was due, so that the wait for a free seat counts.',
    how: 'rows',
  },
  'warm-up-counted': {
    id: 'warm-up-counted',
    term: 'Warm-up counted',
    phrase: 'a counted warm-up',
    means: 'the first requests timed while caches and kernels are still cold',
    shows: 'the first stretch of the log is slow, and the report counted it',
    rule: "Leave out the warm-up by the course's rule, fixed before the run, and time the rest.",
    how: 'cut',
  },
  'warm-cache': {
    id: 'warm-cache',
    term: 'Warm cache',
    phrase: 'a warm cache',
    means: 'prompts that find their prefix already in the server\'s cache from an earlier run',
    shows: "the prompts share a prefix that an earlier run left in the server's cache",
    rule: 'Run it again against a cold prefix cache.',
    how: 'rerun',
  },
  'capped-output': {
    id: 'capped-output',
    term: 'Capped output',
    phrase: 'capped output',
    means: 'every reply cut at a maximum, so the server is never kept busy by long replies',
    shows: 'every reply is cut at max_tokens, so every request is short and the server is never kept busy',
    rule: 'Run it again with no cap on the replies.',
    how: 'rerun',
  },
  'too-few-samples': {
    id: 'too-few-samples',
    term: 'Too few samples',
    phrase: 'too few samples',
    means: 'a p99 read from a handful of requests',
    shows: 'the p99 rests on a handful of requests, so on one or two beyond it',
    rule: 'Run it again with enough requests that at least ten lie beyond the p99.',
    how: 'rerun',
  },
  'mean-as-tail': {
    id: 'mean-as-tail',
    term: 'Mean reported as a tail',
    phrase: 'a mean reported as a tail',
    means: 'the average reported as if it were the p99',
    shows: "the number called a p99 is the log's mean",
    rule: "Report the p99 of the log, timed from the due time.",
    how: 'rows',
  },
  'client-bottleneck': {
    id: 'client-bottleneck',
    term: 'Client bottleneck',
    phrase: 'a client bottleneck',
    means: 'the benchmark\'s own client, the slowest link, which cannot keep to its schedule',
    shows: 'the client saturates first: every send falls behind the schedule whatever the server does',
    rule: 'Run it again with a client that keeps up with its schedule.',
    how: 'rerun',
  },
  'replay-without-timestamps': {
    id: 'replay-without-timestamps',
    term: 'Replay that ignores timestamps',
    phrase: 'a replay that ignores timestamps',
    means: 'a recorded trace replayed at a steady rate instead of at its own timestamps',
    shows: "the arrivals come from the rate flag and not from the trace's own timestamps",
    rule: "Replay the trace at its own pace, with the timestamps it recorded.",
    how: 'rerun',
  },
  none: {
    id: 'none',
    term: 'None: a fair benchmark',
    phrase: 'no flaw',
    means: 'a fair benchmark: the claim is the p99 of the log\'s own requests, timed from the due time',
    shows: "nothing: the claim is the p99 of the log's own rows, timed from the due time",
    rule: 'Nothing to correct. The claim stands.',
    how: 'rows',
  },
}

/** What each way of correcting a number is called, and what it does. */
export const CORRECTION_WORDS: Readonly<Record<CorrectionKind, { readonly name: string; readonly does: string }>> = {
  rows: { name: 'Re-timed from the log', does: 'The log is timed again from the due times, and the p99 is read off its own rows.' },
  cut: { name: 'Cut and re-timed', does: "The warm-up rows, fixed by the course's rule before the run, are left out, and the p99 is read off the rows that remain." },
  rerun: { name: 'Run again', does: 'The benchmark runs again with the flaw taken out of its setup, and the p99 is read off the new log.' },
}
