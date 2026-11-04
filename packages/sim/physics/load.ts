// What one engine step carries (docs/specs/s5.md §3.1 in kernelspace; ARCHITECTURE §5.3): the four integers the step card reads,
// summed over the batch in exact integer arithmetic.
//
//                                  tokens T      KV entries K    causal attention pairs A
//   a decoding sequence, context c     1              c                 c
//   a prefill chunk of p tokens
//   after h were already prefilled     p            h + p        p·h + p(p+1)/2

import type { StepLoad } from './card'

export type StepItem =
  /** A sequence that decodes one token and reads `context` KV entries. */
  | { readonly kind: 'decode'; readonly context: number }
  /** A prefill chunk of `chunk` tokens, after `done` tokens of the same prompt were prefilled. */
  | { readonly kind: 'prefill'; readonly chunk: number; readonly done: number }

function count(x: number, least: number, what: string): void {
  if (!Number.isSafeInteger(x) || x < least) throw new RangeError(`${what} must be an integer of at least ${least}, got ${x}`)
}

/** The load of a step whose batch is `items`: one sequence per item. */
export function stepLoad(items: readonly StepItem[]): StepLoad {
  let tokens = 0
  let kvTokens = 0
  let attnPairs = 0
  for (const item of items) {
    if (item.kind === 'decode') {
      count(item.context, 1, 'a decoding sequence\'s context')
      tokens += 1
      kvTokens += item.context
      attnPairs += item.context
    } else {
      count(item.chunk, 1, 'a prefill chunk')
      count(item.done, 0, 'the tokens already prefilled')
      tokens += item.chunk
      kvTokens += item.done + item.chunk
      // p(p+1) is even, so the half is exact.
      attnPairs += item.chunk * item.done + (item.chunk * (item.chunk + 1)) / 2
    }
  }
  if (!Number.isSafeInteger(attnPairs) || !Number.isSafeInteger(kvTokens)) throw new RangeError('the step is too large to count exactly')
  return { seqs: items.length, tokens, kvTokens, attnPairs }
}
