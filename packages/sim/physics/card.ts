// The S5 step card, vendored unchanged (ARCHITECTURE §5.2 `physics`, §13; DECISIONS D-031): what one engine step costs, in
// four sums and one max. This file only passes it through, so every other module imports the card from here and the day the
// vendored copy moves is a one-file change. The card reads no claims (I3): callers build the shapes, and `./rows` does so for
// the three rows kernelspace fitted. `tests/sim/physics.test.ts` runs kernelspace's golden step vectors through these exports.
//
// The operation order is part of the contract (docs/specs/s5.md §3.2 in kernelspace): plain + − × ÷, one Math.max and one
// Math.round, so the result is bit-identical in Bun and in every browser.

export { NAPKIN, napkinSpec, stepCard } from '../../../vendor/kernelspace/src/lib/world/physics/card'
export type {
  CardParams,
  CardSpec,
  ChipShape,
  ModelShape,
  RowBox,
  RowEnvelope,
  StepCard,
  StepLoad,
} from '../../../vendor/kernelspace/src/lib/world/physics/types'
