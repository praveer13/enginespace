/*
 * The real sources of the plan (plan.ts, ARCHITECTURE §3.2): what fills the route table's parameters in this checkout.
 *
 *   index    the course index, from the content compiler run in memory. Nothing depends on src/content/generated/ existing, so
 *            `verify:routes` works on a tree that has not built yet, and a build reads the same answer the bundle holds;
 *   games    the game registry of packages/play, which W0-T16 gives its first entry, `loop`;
 *   labs     the lab list of the content compiler, which checks a lesson's `labs` against it (§9.2);
 *   traces   none yet, see TRACE_IDS.
 */
import path from 'node:path'
import { GAMES } from '../../packages/play/index.ts'
import { contentIndexSchema, lessonIndexSchema } from '../../packages/schema/compiled.ts'
import type { ContentIndex, LessonIndex } from '../../packages/schema/compiled.ts'
import { compileContent } from '../content/build.ts'
import { LAB_IDS } from '../content/directives.ts'
import { formatDiagnostic } from '../content/parse.ts'
import type { Sources } from './plan.ts'

export const ROOT = path.resolve(import.meta.dirname, '../..')

/** The sources cannot be read: the content has an error, so there is no course index. It carries the compiler's own message, files and lines included. */
export class SourcesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourcesError'
  }
}

/**
 * The Trace Room's traces. There are none yet: W1-T08 makes the synthetic ones and W2-T21 the owner's pinned ones, and the task
 * that adds a trace adds its id here (or replaces this list with the manifest that holds them). Until then `/trace-room/:trace`
 * has no document of its own, and an address under it falls back to 404.html. A trace the learner captured themselves
 * (WORLD.md §3.1) never has one: it stays on the learner's device, so no build can list it.
 */
export const TRACE_IDS: readonly string[] = []

/** The course index and the lesson index of the project under `root`, compiled in memory. It throws, with the files and the lines, when the content has an error. */
export function loadIndexes(root: string = ROOT): { index: ContentIndex; lessons: LessonIndex } {
  const result = compileContent({ root })
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) {
    throw new SourcesError(`the content has ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}, so there is no course index:\n${errors.map(formatDiagnostic).join('\n')}`)
  }
  const read = (file: string): unknown => {
    const output = result.outputs.find((candidate) => candidate.path === file)
    if (output === undefined) throw new SourcesError(`the content compiler wrote no ${file}`)
    return JSON.parse(output.text)
  }
  return { index: contentIndexSchema.parse(read('src/content/generated/index.json')), lessons: lessonIndexSchema.parse(read('src/content/generated/lesson-index.json')) }
}

/** The course index of the project under `root`. */
export const loadIndex = (root: string = ROOT): ContentIndex => loadIndexes(root).index

export function loadSources(root: string = ROOT): Sources {
  return { ...loadIndexes(root), games: GAMES.games, labs: LAB_IDS, traces: TRACE_IDS }
}
