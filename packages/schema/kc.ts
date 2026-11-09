/**
 * The knowledge-component graph (ARCHITECTURE §4.5), `content/kc/graph.yaml`.
 *
 * kernelspace's graph shape: a KC has prerequisites (`requires`), KCs it is mixed up with (`confusable`), and a flag for the
 * few that everything else leans on (`threshold`). The file is a list of KCs. A KC's ledger refs are not stored here: events
 * and content name their KCs, and the ref-to-KC map is built from them at read time.
 *
 * The schema checks one KC, and the graph where every fact is visible in the file itself: no id defined twice, no edge to a
 * KC that is not in the graph, and no cycle among `requires`, which A§4.5 says must be a DAG. What needs content from outside
 * the file stays with `verify:kc` (W1-T03): that each KC has an item, a game level or a lab check behind it, whether
 * `confusable` is symmetric, and whether a `ks:` KC exists in kernelspace.
 */
import { z } from './zod'
import { nonBlank, uniqueList } from './common'
import { kcIdSchema, kcRefSchema } from './refs'

export const kcSchema = z.strictObject({
  id: kcIdSchema,
  /** What the learner can do once they have it. */
  description: nonBlank,
  /** KCs to hold first: ours, or kernelspace's as `ks:t5.kv-capacity`. */
  requires: uniqueList(kcRefSchema).default([]),
  /** KCs that get mixed up with this one, which Today interleaves with it. Ours only. */
  confusable: uniqueList(kcIdSchema).default([]),
  /** Set on a threshold KC, one that later KCs lean on. */
  threshold: z.boolean().optional(),
  /**
   * The task that will add the KC's first item, game level or lab check, as in `W1-T14`. Until W1-T38 a KC may wait on
   * one; that task fails on any that remain.
   */
  planned: z.string().regex(/^W[0-3]-T[0-9]{2}$/, 'must name a tracker task such as W1-T14').optional(),
})

export type Kc = z.infer<typeof kcSchema>

/**
 * The first cycle among the `requires` edges, as the ids from a KC round to itself, and the place of the edge that closes it
 * (the KC's position in the list, then the edge's position in its `requires`). Edges to kernelspace and to ids that are not in
 * the list are skipped: they are other mistakes. Null when the graph is a DAG.
 */
export function findRequiresCycle(kcs: readonly Kc[]): { ids: string[]; at: [number, number] } | null {
  const first = new Map<string, number>()
  kcs.forEach((kc, index) => {
    if (!first.has(kc.id)) first.set(kc.id, index)
  })
  const edgesOf = (id: string): readonly string[] => {
    const index = first.get(id)
    return index === undefined ? [] : kcs[index].requires
  }

  const state = new Map<string, 'open' | 'done'>()
  for (const root of kcs) {
    if (state.has(root.id)) continue
    // Depth first without recursion: a frame is a KC and the position of its next edge.
    const stack = [{ id: root.id, next: 0 }]
    state.set(root.id, 'open')
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      const edges = edgesOf(top.id)
      if (top.next >= edges.length) {
        state.set(top.id, 'done')
        stack.pop()
        continue
      }
      const at = top.next
      top.next += 1
      const to = edges[at]
      if (!first.has(to)) continue
      const seen = state.get(to)
      if (seen === 'open') {
        const from = stack.findIndex((frame) => frame.id === to)
        return { ids: [...stack.slice(from).map((frame) => frame.id), to], at: [first.get(top.id) ?? 0, at] }
      }
      if (seen === 'done') continue
      state.set(to, 'open')
      stack.push({ id: to, next: 0 })
    }
  }
  return null
}

export const kcGraphSchema = z.array(kcSchema).superRefine((kcs, ctx) => {
  const defined = new Set<string>()
  kcs.forEach((kc, index) => {
    if (defined.has(kc.id)) ctx.addIssue({ code: 'custom', message: `KC "${kc.id}" is defined twice`, path: [index, 'id'] })
    defined.add(kc.id)
  })

  kcs.forEach((kc, index) => {
    kc.requires.forEach((to, edge) => {
      if (!to.startsWith('ks:') && !defined.has(to)) {
        ctx.addIssue({ code: 'custom', message: `"${to}" is not in the graph`, path: [index, 'requires', edge] })
      }
    })
    kc.confusable.forEach((to, edge) => {
      if (to === kc.id) ctx.addIssue({ code: 'custom', message: 'a KC cannot be confusable with itself', path: [index, 'confusable', edge] })
      else if (!defined.has(to)) ctx.addIssue({ code: 'custom', message: `"${to}" is not in the graph`, path: [index, 'confusable', edge] })
    })
  })

  const cycle = findRequiresCycle(kcs)
  if (cycle !== null) {
    ctx.addIssue({ code: 'custom', message: `requires has a cycle: ${cycle.ids.join(' → ')}`, path: [cycle.at[0], 'requires', cycle.at[1]] })
  }
})

export type KcGraph = z.infer<typeof kcGraphSchema>
