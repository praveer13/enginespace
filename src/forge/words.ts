/*
 * What the forge page says about a run, in words (ARCHITECTURE §8.3). Pure, so that a test reads the sentence a learner reads.
 */

import type { SlotNight, SlotRow } from '@es/sim'
import type { Recorded } from './useForge'

/**
 * What a finished run came to in the ledger, in a sentence. `passed` says whether every check passed: a red run is written too, as
 * "check failed, retry" and not as a miss, and the sentence says that it takes nothing away (ASSESSMENT §4.6).
 */
export function recordedSentence(recorded: Recorded, lab: string, passed = true): string {
  switch (recorded.kind) {
    case 'none':
      return recorded.why === 'reference'
        ? `${lab}@reference: no credit. A reference build is shown and never recorded.`
        : recorded.why === 'replay'
          ? 'Not recorded: these are seeds you have seen already. Run on new seeds to earn.'
          : 'Not recorded: not every check ran.'
    case 'pending':
      return 'Writing this run to your ledger.'
    case 'saved':
      if (!passed) return 'Written to your ledger as "check failed, retry": it takes nothing away, and a run on new seeds is the next try.'
      return recorded.durable ? 'Written to your ledger on this device: the module, the seeds and each check.' : 'Written to your ledger; the browser has not confirmed that it is saved yet.'
    case 'failed':
      return `Not recorded: ${recorded.detail}`
  }
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* The slot readout of the hybrid-kv page (TR5a §5; SlotReadout.tsx)                                                             */
/* ---------------------------------------------------------------------------------------------------------------------------- */

const WORDS: Readonly<Record<number, string>> = { 1: 'one', 2: 'two' }
export const slotWord = (slots: number): string => WORDS[slots] ?? String(slots)

/** What a slot row is called, and what it is: the first count is vLLM's default for `max_loras` at the pin (vllm.lora.max-loras-default). */
export function slotRow(slots: number, adapters: number): { name: string; what: string } {
  const word = slotWord(slots)
  const name = `${word.charAt(0).toUpperCase()}${word.slice(1)} ${slots === 1 ? 'slot' : 'slots'}`
  if (slots === 1) return { name, what: "vLLM's default at the pin, outside the pool" }
  return { name, what: slots === adapters ? 'one for each adapter, outside the pool' : 'outside the pool' }
}

/** The sentence a screen reader hears when the night has been played. */
export function readoutSentence(night: SlotNight, yours: SlotRow): string {
  const times = (n: number) => (n === 1 ? 'once' : `${n} times`)
  const slots = night.slots.map((s) => `${slotRow(s.slots, night.adapters.length).name.toLowerCase()} admitted ${s.row.admitted} and loaded ${times(s.row.loads)}`)
  return `Slot readout: of ${night.arrivals} requests, your module admitted ${yours.admitted} and loaded adapters ${times(yours.loads)}; ${slots.join('; ')}.`
}

