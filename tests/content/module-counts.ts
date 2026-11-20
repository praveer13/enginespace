/*
 * The counts of the built course, one row per module in course order. A test that holds a total holds it as the sum of these rows, so a
 * module that lands changes its own row and no other line. The modules not yet written have their row at zero.
 */
export interface ModuleRow {
  readonly id: string
  /** The curriculum file that proposes the module's KCs. */
  readonly curriculum: string
  readonly lessons: number
  /** Predictions revealed after the run of a game block. */
  readonly afterGame: number
  /** Predictions revealed at commit. */
  readonly atCommit: number
  /** Game blocks in the module's lessons. */
  readonly gameBlocks: number
}

export const MODULE_ROWS: readonly ModuleRow[] = [
  { id: 'tr0', curriculum: 'curriculum/TR0-pytorch-for-rust.md', lessons: 0, afterGame: 0, atCommit: 0, gameBlocks: 0 },
  { id: 'tr1', curriculum: 'curriculum/TR1-read-the-engines.md', lessons: 7, afterGame: 9, atCommit: 6, gameBlocks: 8 },
  { id: 'tr2', curriculum: 'curriculum/TR2-the-step-loop.md', lessons: 7, afterGame: 4, atCommit: 4, gameBlocks: 9 },
  { id: 'tr3', curriculum: 'curriculum/TR3-profile-a-real-engine.md', lessons: 0, afterGame: 0, atCommit: 0, gameBlocks: 0 },
  { id: 'tr4', curriculum: 'curriculum/TR4-backends-as-a-consumer.md', lessons: 0, afterGame: 0, atCommit: 0, gameBlocks: 0 },
  { id: 'tr5a', curriculum: 'curriculum/TR5a-hybrid-kv-and-adapter-pages.md', lessons: 4, afterGame: 5, atCommit: 2, gameBlocks: 9 },
  { id: 'tr5b', curriculum: 'curriculum/TR5b-offload-connector-events.md', lessons: 0, afterGame: 0, atCommit: 0, gameBlocks: 0 },
  { id: 'tr6', curriculum: 'curriculum/TR6-speculation-and-structure.md', lessons: 5, afterGame: 0, atCommit: 5, gameBlocks: 8 },
  { id: 'tr7', curriculum: 'curriculum/TR7-contribute-honestly.md', lessons: 0, afterGame: 0, atCommit: 0, gameBlocks: 0 },
  { id: 'tr8', curriculum: 'curriculum/TR8-benchmark-like-you-mean-it.md', lessons: 4, afterGame: 0, atCommit: 4, gameBlocks: 8 },
]

const sum = (pick: (row: ModuleRow) => number): number => MODULE_ROWS.reduce((total, row) => total + pick(row), 0)

/** The modules with at least one built lesson, in course order. */
export const BUILT_MODULES: readonly ModuleRow[] = MODULE_ROWS.filter((row) => row.lessons > 0)

export const TOTAL_LESSONS = sum((row) => row.lessons)
export const TOTAL_AFTER_GAME = sum((row) => row.afterGame)
export const TOTAL_AT_COMMIT = sum((row) => row.atCommit)
export const TOTAL_PREDICTIONS = TOTAL_AFTER_GAME + TOTAL_AT_COMMIT
export const TOTAL_GAME_BLOCKS = sum((row) => row.gameBlocks)

/** The games that have a 3D scene, sorted; a game that adds a scene is added here. */
export const GAMES_WITH_SCENE: readonly string[] = ['loop', 'pool', 'verifier']
