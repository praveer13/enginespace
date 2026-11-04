// The item framework (ARCHITECTURE §8.2, W1-T04): generator families, the draws that make an attempt's items, grading, the
// blind-strategy measure that `verify:items` holds a family to, and the attempt that a lesson's `item` block plays. Pure, like the rest
// of packages/play: no DOM, no clock, no entropy. A seed arrives from outside (`src/items` reads it when an attempt starts).
//
//   types      the vocabulary: Gen, Item, Rich text, Response, Grade, levels, confidence
//   rich       building and reading Rich text
//   draw       seeds, variants, the fingerprint and drawInBand
//   grade      numeric and choice grading, with diagnoses
//   blind      blind strategies and their bound; the band's acceptance
//   attempt    an attempt at a lesson's `item` block: its items, answers and results
//   regrade    grading a stored answer again from its seed
//   registry   the families
export * from './types'
export * from './rich'
export * from './draw'
export * from './grade'
export * from './blind'
export * from './attempt'
export * from './regrade'
export * from './registry'
