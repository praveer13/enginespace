// `tensor` (ARCHITECTURE §5.8; GAMES.md §4; W2-T13): a buffer plus shape, strides and offset, with PyTorch's rules for which operations
// move metadata and which move elements, the fewest-copies search that Sheet Pan's ghost plays, and a Triton-style grid's coverage.
// The view rules agree with torch 2.14.0 on tests/fixtures/tensor/torch-vectors.json. Sheet Pan (W2-T14, W2-T15) plays it.
export * from './view'
export * from './plan'
export * from './grid'
