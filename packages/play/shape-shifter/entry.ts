/**
 * Tensor views' record in the game registry (ARCHITECTURE §6.3, D-063): what is known about the game without running it. It is data and one
 * loader. The rules load with the game (`session`, below), so the registry never pulls the sim into a page that only lists games.
 *
 * The game is not routed yet: W2-T14 builds its 2D view in the frame, adds this record to the registry and turns Prove on for `fewest`.
 * Practice seeds are pinned here as plain numbers because this file may not import the levels (they import the sim). Each is the first seed
 * from 0 that draws the tensor GAMES.md §4.3 prints for the level, and tests/play/shape-shifter-entry.test.ts checks that it still does.
 */
import type { GameEntry } from '../types'

export const SHAPE_SHIFTER: GameEntry = {
  id: 'shape-shifter',
  modules: ['tr0'],
  title: 'Tensor views',
  subtitle: 'A view relabels the buffer. A copy moves every element.',
  // 2D only: the 3D scene is not built (GAMES.md §4.2).
  has3d: false,
  kcs: ['tr0.tensor-metadata', 'tr0.view-vs-copy', 'tr0.broadcast-stride-zero', 'tr0.triton-program-model', 'tr0.triton-masks'],
  keys: [
    { id: 'launch', code: 'KeyL', label: 'L', description: 'Launch the grid' },
    { id: 'undo', code: 'KeyU', label: 'U', description: 'Undo the last operation, in practice' },
  ],
  levels: [
    { id: 'views', title: 'A transpose is a view', graded: false, practiceSeed: 30 },
    { id: 'stride-zero', title: 'Broadcasting is stride 0', graded: false, practiceSeed: 10 },
    { id: 'three-d', title: 'One block per head', graded: false, practiceSeed: 26 },
    { id: 'fewest', title: 'Fewest copies', graded: true, practiceSeed: 0 },
    { id: 'grid', title: 'A grid of programs', graded: true, practiceSeed: 0 },
  ],
  prove: 'fewest',
  card: 'tensor',
  claims: [
    'torch.stride.definition',
    'torch.view.shares-data',
    'torch.view.needs-compatible-strides',
    'torch.view.otherwise-copy',
    'torch.reshape.view-if-compatible',
    'torch.views.contiguous-copies',
    'torch.views.no-data-moves',
    'torch.expand.stride-zero',
    'torch.expand.one-address',
    'triton.program-id',
    'triton.arange-power-of-two',
    'triton.cdiv-host',
    'triton.load-mask',
    'triton.store-mask',
  ],
  session: async () => (await import('./session')).shiftSession,
}
