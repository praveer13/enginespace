/*
 * The Play index's words (W1-T06), in one place so that the page and its tests read the same copy. The display name leads over its
 * subtitle, the engine concept (D-049); the kitchen's board holds the games and the engine's terms name what each one plays.
 */

export const SPECIALS = {
  title: 'Games',
  /** The kitchen's word for the page, on tape beside the engine's term. */
  term: 'the specials',
  lede: [
    'Each game plays one rule of the engine in a seeded world, and the rule is the concept itself. Every game can be played flat on the page, and the ones with a scene can be played in it as well.',
    'The games on the board can be played now. The rest hang here as bare pans until the wave that brings them.',
  ],
  open: 'On the board',
  arriving: 'Arriving',
  play: 'Play',
  view: { d2: '2D', d3: '3D', twoToo: '2D view too' },
  modules: 'Module',
  also: 'also',
  arrivesWith: 'arriving with',
  notBuilt: 'Not built yet.',
  poster: {
    /** In a well whose game has no picture, or whose picture did not come. A drawing that does come carries its own name for a reader that cannot see it. */
    none: 'No picture yet',
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
