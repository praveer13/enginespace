/*
 * The pacing warnings (REDESIGN §2.5, the authoring rules): what the compiler says about a lesson's rhythm, so an author or an agent hears it
 * before a reviewer does. Every one is a warning and none fails the compiler, `verify:content` or the build: pacing is advice, and the
 * gates that hold a lesson's shape are the openers test and the map's own rules.
 *
 *   opener-setup-long   more than 200 words precede an opener's game (rule 1)
 *   opener-c-slow       an opener C lesson's first thing to do comes after more than 450 words (rule 3)
 *   pacing-gap          more than 600 words lie between two things the learner does (rule 3)
 *   graded-not-last     a graded game block is not under the file's last heading (rule 4)
 *   no-test             a lesson has no Test (rule 4; raised with the map, `buildMap` in build.ts)
 *   build-log-id        prose holds a build-log id: a task, a decision or a design-document section (rule 5)
 *
 * The compiler hands this file the lesson as a list of items in file order, each with its line, so it knows nothing of Markdown or YAML.
 * The numbers are the brief's [estimated].
 */
import { problem } from './parse.ts'
import type { Diagnostic, Segment } from './parse.ts'

/** The words a lesson may spend before the learner does something (REDESIGN §2.5, authoring rule 3 and the openers' table) [estimated]. */
export const PACING = {
  /** Before an opener's game: opener B's primer, at most. */
  beforeOpener: 200,
  /** Before an opener C lesson's first thing to do. */
  beforeFirstC: 450,
  /** Between two things the learner does. */
  between: 600,
} as const

/** The codes of the pacing family, which are advice for the content tasks of wave R and never an error. */
export const PACING_CODES: readonly string[] = ['opener-setup-long', 'opener-c-slow', 'pacing-gap', 'graded-not-last', 'no-test', 'build-log-id']

/** The blocks the learner does something in: a guess, a run, a question, a trace. */
export type Doing = 'predict' | 'game' | 'item' | 'trace'

/** One thing in the file, in order, as the compiler read it. */
export type PaceItem =
  | { kind: 'words'; count: number }
  | { kind: 'heading'; line: number }
  | { kind: 'do'; what: Doing; line: number; graded: boolean }

/** The lines of the `## ` headings of a prose segment's Markdown, in order, outside fenced code. */
export function headingLines(md: string, first: number): number[] {
  const lines: number[] = []
  let fence = ''
  md.split('\n').forEach((text, at) => {
    const mark = /^\s*(```+|~~~+)/.exec(text)
    if (mark !== null) {
      const kind = mark[1][0]
      fence = fence === '' ? kind : fence === kind ? '' : fence
      return
    }
    if (fence === '' && /^##(?!#)\s/.test(text)) lines.push(first + at)
  })
  return lines
}

/** Build-log ids: a task (`W2-T43`, `R-T09`), a decision (`D-016`, `O-3`) and a section of a design document (`A§5.3`, `GAMES.md §3`). */
export const BUILD_LOG = /\b(?:W\d+[a-z]?-T\d+|R-T\d+|D-\d{2,3}|O-\d+)\b|\bA§\d|\b(?:ARCHITECTURE|REDESIGN|TRACKER|GAMES\.md|ASSESSMENT|WORLD)\b/

/** Build-log ids in a prose segment: one warning for each line that holds one. Fenced code is not prose. */
function buildLogIds(segment: Segment, file: string, out: Diagnostic[]): void {
  if (segment.kind !== 'prose') return
  let fence = ''
  segment.md.split('\n').forEach((text, at) => {
    const mark = /^\s*(```+|~~~+)/.exec(text)
    if (mark !== null) {
      const kind = mark[1][0]
      fence = fence === '' ? kind : fence === kind ? '' : fence
      return
    }
    if (fence !== '') return
    const found = BUILD_LOG.exec(text)
    if (found !== null) {
      out.push(problem('content', 'warning', 'build-log-id', file, segment.line + at, `the prose says "${found[0]}", which is a build-log id: a learner reads the engine's own words, so say what it means`))
    }
  })
}

/** The warnings for one lesson. `items` is the file in order, `segments` its parsed text. Never an error. */
export function pacingDiagnostics(file: string, items: readonly PaceItem[], segments: readonly Segment[], out: Diagnostic[]): void {
  for (const segment of segments) buildLogIds(segment, file, out)

  // Where the first heading is, and which thing is first.
  const firstHeading = items.findIndex((item) => item.kind === 'heading')
  const firstGame = items.findIndex((item) => item.kind === 'do' && item.what === 'game')
  const opener = firstGame >= 0 && (firstHeading < 0 || firstGame < firstHeading)

  let words = 0
  let sinceDoing: number | null = null
  let sawDoing = false
  for (const item of items) {
    if (item.kind === 'words') {
      words += item.count
      if (sinceDoing !== null) sinceDoing += item.count
    } else if (item.kind === 'do') {
      if (!sawDoing && !opener && words > PACING.beforeFirstC) {
        out.push(problem('content', 'warning', 'opener-c-slow', file, item.line, `an opener C lesson's first thing to do comes after ${words} words, and the most is ${PACING.beforeFirstC} [estimated]: end its first part in a guess or a question`))
      }
      if (sinceDoing !== null && sinceDoing > PACING.between) {
        out.push(problem('content', 'warning', 'pacing-gap', file, item.line, `${sinceDoing} words lie between this and the thing to do before it, and the most is ${PACING.between} [estimated]: put a guess, a run or a question in the stretch`))
      }
      sawDoing = true
      sinceDoing = 0
    }
  }
  if (!sawDoing && words > PACING.beforeFirstC) {
    out.push(problem('content', 'warning', 'opener-c-slow', file, 1, `the lesson has ${words} words and nothing to do, and the most before the first thing is ${PACING.beforeFirstC} [estimated]`))
  }

  if (opener) {
    const game = items[firstGame]
    let before = 0
    for (const item of items.slice(0, firstGame)) if (item.kind === 'words') before += item.count
    if (game.kind === 'do' && before > PACING.beforeOpener) {
      out.push(problem('content', 'warning', 'opener-setup-long', file, game.line, `${before} words precede the opener's game, and the most is ${PACING.beforeOpener} [estimated]: keep the primer to the facts the level needs, or open on reading (opener C)`))
    }
  }

  // Rule 4: a graded game block sits under the file's last heading.
  const lastHeading = items.reduce((last, item, at) => (item.kind === 'heading' ? at : last), -1)
  items.forEach((item, at) => {
    if (item.kind === 'do' && item.graded && at < lastHeading) {
      out.push(problem('content', 'warning', 'graded-not-last', file, item.line, "a graded game block belongs under the file's last ## heading, in the Test"))
    } else if (item.kind === 'do' && item.graded && lastHeading < 0) {
      out.push(problem('content', 'warning', 'graded-not-last', file, item.line, 'a graded game block belongs under the lesson\'s last ## heading, and this lesson has no heading'))
    }
  })
}
