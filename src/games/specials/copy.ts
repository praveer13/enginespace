/*
 * The Games index's words, in one place so that the page and its tests read the same copy. The engine's name for a game leads, then
 * the role the learner takes in it and the rule it plays (REDESIGN §2.7, §3.8): no kitchen word, no task, no wave.
 */

export const SPECIALS = {
  title: 'Games',
  lede: [
    'Each game puts you in one seat of the engine and plays a single rule in a seeded world. The rule is the concept itself.',
    'A practice level can be replayed as often as you like. A graded level runs on a fresh seed with no undo, and passing it counts toward a skill.',
  ],
  play: 'Play',
  levels: 'Levels',
  view: { d2: '2D', d3: '3D', twoToo: '2D view too' },
  modules: 'Module',
  also: 'also',
  notPublished: 'Not published yet',
  kinds: { practice: 'practice', graded: 'graded' },
  traces: {
    link: 'Traces',
    lead: 'Read engine traces beside the seeded step-loop world.',
  },
} as const

/**
 * Every string above that holds words, for the tests. The names of the two views, 2D and 3D, are names and not quantities, as an id is,
 * so they are left out of what the number rule reads; no other digit is in the copy.
 */
export function specialsCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk({ ...SPECIALS, view: {} })
  return out
}
