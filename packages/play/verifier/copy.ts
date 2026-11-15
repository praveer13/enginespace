/**
 * What the Tasting's levels say, by level id (R-T02): the title on the rail and the line a level opens on. The words are display copy
 * and no rule reads them, so they are not in a level or a state: rewording one moves no state hash and no golden. The view reads them
 * here by id (`verifierView`), and `levelTitle` serves the registry's record.
 *
 * The kitchen's word names the object and the engine's term rides beside it (GAMES.md §2.6, rule 2), and no prompt holds a digit: the
 * figures are in the mirror, the tape and the drawing, each tagged synthetic.
 */
import type { VerifierLevelId } from './types'

export interface LevelCopy {
  readonly title: string
  readonly prompt: string
}

export const VERIFIER_COPY: Readonly<Record<VerifierLevelId, LevelCopy>> = {
  overlap: {
    title: 'What the chef keeps',
    prompt:
      'The commis has plated a stack for each dish ahead of the chef. The plates both stacks share are the ones she keeps (the overlap, min(p, q), which is α). Predict how many of the sixty-four plates she keeps, then watch rounds go down the pass.',
  },
  exact: {
    title: 'Make it exact',
    prompt:
      'The chef keeps a commis plate with probability min(1, p ÷ q), the accept rule. When she sends one back she re-plates from a recipe of yours: how heavily she draws from each dish. Sculpt the recipe until what goes out is her tasting exactly (the output is p, total variation distance zero), then submit.',
  },
  chain: {
    title: 'A run of plates',
    prompt:
      'The commis plates a run of courses ahead, and the chef tastes them in order. She stops at the first plate she sends back, and plates one extra course herself when she keeps them all (the bonus token). Predict how many courses a round serves on average.',
  },
  'greedy-ngram': {
    title: 'The favourite and the copier',
    prompt:
      'A copier plates whatever the night served lately and knows nothing of how often, so its q is a single dish (an n-gram draft). First, at temperature zero the chef always sends her favourite: is the copier\'s plate kept? Then, at full temperature, sculpt the re-plating that still sends out her tasting exactly.',
  },
  mutants: {
    title: 'Five rules to audit',
    prompt:
      'Five tasting rules, each a little wrong in a different way. Taste a rule, or check every coin of its accept step, and name the bug in each one.',
  },
  gamma: {
    title: 'How far ahead',
    prompt:
      'The chef tastes a whole run in one go, and each plate the commis sets down costs a fraction of a tasting. The further along the run, the less likely she gets that far. Choose how many plates ahead the commis should plate for the most courses a tasting buys (the draft length γ).',
  },
}
