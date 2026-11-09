/**
 * The Tasting's record in the game registry (ARCHITECTURE §6.3, D-049): what is known about the game without running it, which the Play
 * index, the static-routes script and `verify:games` read. It is data and one loader. The rules load with the game (`session`, below),
 * so the registry never pulls the sim into a page that only lists games.
 *
 * Practice seeds are pinned here as plain numbers because this file may not import the levels (they import the sim). Each is the first
 * seed from 0 that the level's band accepts (GAMES.md §2.1), and tests/play/verifier-levels.test.ts checks that it still is.
 */
import type { GameEntry } from '../types'

export const VERIFIER: GameEntry = {
  id: 'verifier',
  modules: ['tr6'],
  title: 'The Tasting',
  subtitle: "speculative decoding's verifier",
  // The pass where the chef tastes, in 3D (W1-T29, src/games/verifier/Scene3D.tsx), over the 2D view that paints first.
  has3d: true,
  // The graded levels (`exact`, `chain`, `gamma`) earn these; `overlap`, `greedy-ngram` and `mutants` are practice.
  kcs: ['tr6.exact-acceptance', 'tr6.residual-recovery', 'tr6.acceptance-length'],
  keys: [
    { id: 'draw', code: 'KeyD', label: 'D', description: 'Draw a batch of rounds' },
    { id: 'submit', code: 'Enter', label: 'Enter', description: 'Submit the answer' },
  ],
  levels: [
    { id: 'overlap', title: 'What the chef keeps', graded: false, practiceSeed: 0 },
    { id: 'exact', title: 'Make it exact', graded: true, practiceSeed: 0 },
    { id: 'chain', title: 'A run of plates', graded: true, practiceSeed: 1 },
    { id: 'greedy-ngram', title: 'The favourite and the copier', graded: false, practiceSeed: 0 },
    { id: 'mutants', title: 'Five rules to audit', graded: false, practiceSeed: 0 },
    { id: 'gamma', title: 'How far ahead', graded: true, practiceSeed: 0 },
  ],
  card: 'spec',
  claims: [
    'spec.paper.accept-or-resample',
    'spec.paper.bonus-token',
    'spec.paper.expected-tokens',
    'vllm.spec.rejection-sampler.exact',
    'vllm.spec.bonus-token',
    'vllm.spec.fly-lossy',
    'sglang.spec.pr-35798',
    'sglang.spec.pr-35798-fix',
  ],
  session: async () => (await import('./session')).verifierSession,
}
