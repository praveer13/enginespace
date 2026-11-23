/**
 * Trace attribution's record in the game registry (ARCHITECTURE §6.3, D-063): what is known about the game without running it. It is data and
 * one loader. The rules load with the game (`session`, below), so the registry never pulls the sim into a page that only lists games.
 *
 * The game is not registered yet: W2-T20 builds its 2D view in the frame and adds this record to the registry. `pinned` and `yours` are not
 * built, so they are not listed here (TR3's design, "Before you write", item 5). Practice seeds are plain numbers because this file may not
 * import the levels; `gap` and `attribute` are graded on every seed but 0 (engine.ts), so 0 is their practice seed.
 */
import type { GameEntry } from '../types'

export const GAP_HUNT: GameEntry = {
  id: 'gap-hunt',
  modules: ['tr3'],
  title: 'Trace attribution',
  subtitle: 'Every nanosecond of a step belongs to a kernel, a copy, a CPU gap or idle.',
  // 2D only (GAMES.md §6).
  has3d: false,
  kcs: ['tr3.trace-anatomy', 'tr3.graph-traces', 'tr3.partition', 'tr3.gap-cause'],
  keys: [
    { id: 'edge-prev', code: 'KeyJ', label: 'J', description: 'Jump to the previous event edge' },
    { id: 'edge-next', code: 'KeyK', label: 'K', description: 'Jump to the next event edge' },
    { id: 'mark', code: 'KeyM', label: 'M', description: 'Set the start or the end of a mark' },
    { id: 'cause', code: 'KeyX', label: 'X', description: 'Name the focused call as the cause' },
    { id: 'unmark', code: 'KeyU', label: 'U', description: 'Take back the last mark' },
    { id: 'category-kernel', code: 'Digit1', label: '1', description: 'Mark as kernel' },
    { id: 'category-copy', code: 'Digit2', label: '2', description: 'Mark as copy-only' },
    { id: 'category-cpu-gap', code: 'Digit3', label: '3', description: 'Mark as the CPU gap' },
    { id: 'category-both-idle', code: 'Digit4', label: '4', description: 'Mark as both idle' },
  ],
  levels: [
    { id: 'read', title: 'A launch and its kernel', graded: false, practiceSeed: 0 },
    { id: 'graphs', title: 'Graph replays', graded: false, practiceSeed: 0 },
    { id: 'gap', title: 'The largest gap', graded: true, practiceSeed: 0 },
    { id: 'attribute', title: 'Every nanosecond', graded: true, practiceSeed: 0 },
  ],
  prove: 'attribute',
  card: 'trace-room-trace',
  // The two claims of the course that a trace's CPU gap and a graph replay already rest on. The profilers' own claims join them when the
  // sources of TR3 are written, and each is added here in its own commit.
  claims: ['vllm.v1.cpu-overhead-goal', 'vllm.cudagraph.purpose'],
  session: async () => (await import('./session')).huntSession,
}
