// The knowledge components that a receipt of each stage earns (content/kc/graph.yaml), by stage id (`tr0.forward.s2`). A grader lab is
// graded by the checks that its stage requires (stages.ts), so the stage names the KCs, as a forge lab's check does in
// packages/sim/forge/kcs.ts. `verify:kc` reads this table as the source of the receipts' graded references, named `receipt:<stage>`
// (scripts/verify-kc.ts): a row for a stage that src/receipts/labs.ts does not list fails the gate, and a KC that the graph does not have
// does too. The progress map reads it first, then the lab's KCs (src/progress/kcmap.ts). A receipt earns its KCs only when its event is
// ok, so a receipt that is not credited (a check fails, or a bank is missing) earns none. A module's lab task adds its rows here (TR0's, W2-T16, are the first).
// Data only, like the rest of packages/verify's tables.

export const STAGE_KCS: Readonly<Record<string, readonly string[]>> = {
  // TR0's forward pass: loading the checkpoint into the learner's own module is half of stage 2, which also follows the whole decoder; stage 3 adds the cache.
  'tr0.forward.s2': ['tr0.module-as-struct', 'tr0.decoder-forward'],
  'tr0.forward.s3': ['tr0.kv-cache-contract'],
}
