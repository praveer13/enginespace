// The knowledge components that each graded forge lab's checks assess (content/kc/graph.yaml), by lab and by check: data, and nothing that
// runs a lab. A lab is passed on seeds drawn at grade time (ASSESSMENT §4.5), so each of its checks names the KCs it assesses, as an item
// family and a game do. Two readers want this table, and they want different things beside it:
//
//   - `verify:kc` reads it with the lab's checks, through `LAB_CHECK_KCS` (kcs.ts), to hold every check id to the lab and every KC to the graph;
//   - the map and the module pages read it with nothing else (src/progress/sources.ts), to say which KCs a `lab:<lab>` event moves. The checks
//     carry their oracles, the hybrid KV manager and the sampler's spec among them, and `LAB_CHECK_KCS` brought those onto both pages: it took
//     the module page over its 200 KB gate, and src/progress/sources.ts has the figures.
//
// So this file imports nothing, and tests/sim/forge-check-kcs.test.ts holds it to that. A lab that grades adds its table here and its row,
// with its checks, to kcs.ts (W2-T29's `kv-publisher`); the same test fails until both agree.

/**
 * The knowledge components that a check assesses (content/kc/graph.yaml), which `verify:kc` reads through kcs.ts. The exit review
 * (W1-T38) wired that source and removed the `planned: W1-T22` lines that these checks answer.
 */
export const HYBRID_KV_KCS: Readonly<Record<string, readonly string[]>> = {
  sliding: ['tr5a.sliding-free', 'tr5a.all-or-nothing'],
  state: ['tr5a.state-pages'],
  hit_all_groups: ['tr5a.hit-intersection'],
  adapter_pages: ['tr5a.adapter-pages', 'tr5a.all-or-nothing'],
}

/**
 * The knowledge components that a check assesses (content/kc/graph.yaml), which `verify:kc` reads through kcs.ts. The mapping is the one
 * W1-T27 proposed when it built the lab: `accept` is the accept rule, `residual`, `pick` and `round` are the recovery from the residual
 * and the walk that draws it, and `exact` is the chi-square test of exactness that the host runs on the learner's sampler.
 */
export const REJECTION_SAMPLER_KCS: Readonly<Record<string, readonly string[]>> = {
  accept: ['tr6.exact-acceptance'],
  residual: ['tr6.residual-recovery'],
  pick: ['tr6.residual-recovery'],
  round: ['tr6.residual-recovery'],
  exact: ['tr6.exactness-testing'],
}

/** Every graded forge lab's table, by lab id. kcs.ts gives each one its checks, and the test holds the two lists to each other. */
export const GRADED_LAB_KCS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  'hybrid-kv': HYBRID_KV_KCS,
  'rejection-sampler': REJECTION_SAMPLER_KCS,
}

// A Map, because a lab id comes from a ledger ref and `constructor` is a slug that a ref may carry.
const OF_LAB: ReadonlyMap<string, readonly string[]> = new Map(Object.entries(GRADED_LAB_KCS).map(([lab, checks]) => [lab, [...new Set(Object.values(checks).flat())]]))

/**
 * The KCs that a graded lab's checks assess together, each once, in the order of its table: the KCs a `lab:<lab>` event is evidence for,
 * since a run records the lab's checks as one event (ASSESSMENT §4.5). None for a lab with no table here, which is every lab but the
 * graded forge labs until W2 gives the GPU labs' stages theirs.
 */
export function kcsOfLab(lab: string): readonly string[] {
  return OF_LAB.get(lab) ?? []
}
