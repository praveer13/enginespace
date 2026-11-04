/*
 * The course map's words (W1-T06), in one place so that the page, its tests and the module page read the same copy. The kitchen word
 * names the object and the engine term names the concept (GAMES.md §2.6, rule 2): the course map is the menu, a module is a ticket on
 * the rail, and a knowledge component is the thing the learner can do once they hold it. The copy holds no number: every count, hour
 * and total is printed through the dot matrix from the course and the ledger.
 */

export const MAP = {
  title: 'Course map',
  /** The kitchen's word for the map, on tape beside the engine's term (GAMES.md §2.6). */
  term: 'the menu',
  lede: [
    'Every module hangs on the rail in the order you meet them. What a ticket advises you to do first never locks it: any ticket opens.',
    'The dots are a ticket’s knowledge components, counted from the events in this browser each time the page draws: a ring is one you have not met, a ringed dot one you have practised, a solid dot one you have earned, and a ticked dot one you have kept.',
  ],
  modules: 'The modules, in order',
  /** The tape's name, and its lines. */
  tape: {
    name: 'The course so far',
    hours: 'hours, all',
    lanes: { B: 'browser', L: 'laptop', F: 'GPU' },
    earned: 'earned',
    kept: 'kept',
    next: 'next ticket',
    of: 'of',
    none: 'none yet',
    reading: 'reading your ledger',
  },
  /** On the ticket that the lamp is over. */
  next: 'next ticket',
  advised: 'Advised first',
  kernelspace: 'kernelspace',
  hoursNote: 'hours estimated',
  open: 'Open',
  holding: {
    reading: 'Reading your ledger',
    none: 'No knowledge components yet',
    earned: 'earned',
    of: 'of',
    practising: 'practised',
    kept: 'kept',
    nothing: 'Nothing earned yet',
  },
  notice: {
    loadingTitle: 'Course map',
    loadingWhat: 'course map',
    failedTitle: 'The course map did not load',
    failedMessage: 'The map would not print. Check your connection and reload the page.',
  },
} as const

/** A module page's loop (ARCHITECTURE §3.1: Predict, Play, Build, Prove, Keep) and what the learner holds of it. */
export const LOOP = {
  title: 'How this module runs',
  term: 'the loop',
  lede: 'Every module runs the same five steps. The counts are of the events in this browser, read when the page draws.',
  steps: {
    predict: { name: 'Predict', what: 'Commit your answer before each reveal. A prediction earns no credit.' },
    play: { name: 'Play', what: 'Play the games on practice seeds, then answer on fresh ones.' },
    build: { name: 'Build', what: 'Write the lab, and run it against checks drawn when you start.' },
    prove: { name: 'Prove', what: 'Do it again on fresh seeds with your agent closed.' },
    /** Follows a link to Today, which is the first word of the sentence. */
    keep: { name: 'Keep', what: 'brings back what you have earned, a few weeks on.' },
  },
  games: 'Games',
  labs: 'Labs',
  noGame: 'No game of its own.',
  noLab: 'No lab to write in this module.',
  arrives: 'arriving with',
  today: 'Today',
  made: 'made',
  credited: 'credited',
  of: 'of',
  tried: 'tried',
  partial: 'at part credit',
  nothing: 'nothing yet',
  proved: 'proved',
  notYet: 'not yet',
  kept: 'knowledge components kept',
  reading: 'Reading your ledger',
} as const

export const KCS = {
  title: 'Knowledge components',
  term: 'what you can do',
  lede: 'Each one is something you can do once you hold it. A ring is one you have not met, a ringed dot one you have practised, a solid dot one you have earned, and a ticked dot one you have kept.',
  states: { none: 'not yet', practised: 'practised', earned: 'earned', kept: 'kept' },
  /** Printed once, when some of the module's KCs have no graded item behind them yet (ASSESSMENT §3.3: a practice level earns at most part credit). */
  planned: 'Some of these cannot be earned yet: the first graded item for each is still being built.',
  reading: 'Reading your ledger',
  count: { of: 'of', earned: 'earned', kept: 'kept' },
} as const

/** Every string above, for the tests. */
export function mapCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk([MAP, LOOP, KCS])
  return out
}
