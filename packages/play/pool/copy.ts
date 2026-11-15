/**
 * What the Reach-In's levels say, by level id (R-T02): the title on the rail, the line a level opens on, and the prediction's question
 * with the unit its answer is in. The words are display copy and no rule reads them, so they are not in a level or a state: rewording
 * one moves no state hash and no golden. The view reads them here by id (`poolView`), and `levelTitle` serves the registry's record.
 * The prediction's answer is not copy: it is the sim's own arithmetic, in the level.
 *
 * The copy follows GAMES.md §2.6: the kitchen word names the object and the engine term rides beside it. It carries no digit, so no
 * number goes untagged: the counters are Readouts, and the mirror holds every figure.
 */
import type { PoolLevelId } from './types'

/** What a level asks the learner to predict before the first decision (GAMES.md §8: "Predict the pages a request will hold"), in words. */
export interface PoolPredictCopy {
  readonly ask: string
  readonly unit: 'pages' | 'stations'
}

export interface PoolCopy {
  readonly title: string
  /** The line the level opens on, in the kitchen's words with the engine's term beside them. */
  readonly prompt: string
  readonly predict: PoolPredictCopy
}

export const POOL_COPY: Readonly<Record<PoolLevelId, PoolCopy>> = {
  'one-group': {
    title: 'One station',
    prompt:
      'One station keeps every pan an order needs. Hang a ticket (admit a request), and a ticket that opens like an earlier one starts from that one\'s pans: shared mise, a prefix hit. When a ticket needs room, say which cached pans to dump (evict).',
    predict: { ask: 'How many pans will ticket No. 01 hold, across every station, once it hangs?', unit: 'pages' },
  },
  'two-kinds': {
    title: 'Two kinds of station',
    prompt:
      'A full-attention station keeps every pan of an order, and a sliding-window station keeps only the pans of its hold window and lets the rest go back to the rotation. One order holds pans at all three stations.',
    predict: { ask: 'How many pans will ticket No. 01 hold, across every station, once it hangs?', unit: 'pages' },
  },
  evict: {
    title: 'Dump the right pans',
    prompt:
      'The reach-in is full, and a ticket hits only as far as every station still holds its pans. When a ticket needs room, dump the pans nobody is waiting on, and keep the head of an order: every later hit starts from it.',
    predict: { ask: 'How many pans will ticket No. 01 hold, across every station, once it hangs?', unit: 'pages' },
  },
  'same-size': {
    title: 'One pan size',
    prompt:
      'Every station\'s pan is the same size, so the model\'s layers are grouped to fill one pan, and the layers that do not fill a group are padded. Count the stations, and see what the padding wastes.',
    predict: { ask: 'How many stations does this model need, so that every pan is one size?', unit: 'stations' },
  },
  state: {
    title: 'A station of state',
    prompt:
      'A recurrent layer keeps a fixed number of pans for each ticket, however long its order runs, and the full-attention pans are made larger to match. A hit needs the pan that holds the state at its edge.',
    predict: { ask: 'How many pans do the state stations hold for one ticket, however long its order runs?', unit: 'pages' },
  },
  adapters: {
    title: 'Recipe kits',
    prompt:
      'A recipe kit is a variant\'s own mise, in pans from the same reach-in. A ticket hangs only when its kit has landed, and a kit stays while a ticket that uses it is on the line. Bring a kit in before its ticket hangs, and mind what it costs the cached pans.',
    predict: { ask: 'How many pans does the largest recipe kit take?', unit: 'pages' },
  },
  manager: {
    title: 'The whole manager',
    prompt:
      'Everything at once: stations of every kind, a full reach-in, and recipe kits that compete with the cached pans. Run the manager\'s policy on a night you have not seen.',
    predict: { ask: 'How many pans will ticket No. 01 hold, across every station, once it hangs?', unit: 'pages' },
  },
}
