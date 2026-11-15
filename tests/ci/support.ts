/*
 * What the CI tests share: reading the repository's documents, and picking tables and backticked names out of them. The
 * tests read ARCHITECTURE.md and TRACKER.md themselves, so a change to a document without the code, or the reverse, fails.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'

export const root = path.resolve(import.meta.dirname, '../..')
export const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

/**
 * The `if` of the step that installs Bun from npm when setup-bun's download from GitHub failed (ARCHITECTURE §10.3). The tests
 * that list a job's commands leave that step out: workflows.test.ts checks it on its own, after every setup-bun step.
 */
export const BUN_FALLBACK = "steps.bun.outcome == 'failure'"

/** The text between two markers. A renamed heading throws instead of silently parsing nothing. */
export function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from)
  const end = text.indexOf(to, start + from.length)
  if (start < 0 || end < 0) throw new Error(`the document no longer has "${from}" followed by "${to}"`)
  return text.slice(start + from.length, end)
}

/** The cells of each row of the first markdown table in `text`, without its header and separator rows. */
export function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
}

export const backticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1])

/**
 * The id of a task of TRACKER.md, as a regular expression's source: a wave, a dash and a two-digit number (`W1-T14`). The wave is a digit,
 * and a carry-over wave adds a `b` to its digit (`W1b-T08`). Every reader of the tracker's headings takes its ids by this pattern. The
 * patterns that this one replaced read `W\d-T\d\d`, so W1b's tasks were invisible to the marker guard of workflows.test.ts, to its check of
 * the reserved steps and to verify:kc (docs/waves/W1b-report.md §10). tests/ci/task-ids.test.ts fails on a heading whose id this pattern
 * does not read, so a wave named in a new shape is a change here, and is never skipped without a word.
 */
export const TASK_ID = String.raw`W\d+b?-T\d\d`

/** TRACKER.md's task headings (`#### [=] W1b-T08 · Lab pages hand over the crate · S · sonnet · deps: —`), each one's marker and id, in the order of the page. */
export function taskHeadings(tracker: string): { marker: string; id: string }[] {
  return [...tracker.matchAll(new RegExp(`^#### \\[(.)\\] (${TASK_ID}) · `, 'gm'))].map((match) => ({ marker: match[1], id: match[2] }))
}

/**
 * The ids of the headings that open as a task does (`#### [m] <id> · `) and whose id TASK_ID does not read. Each is a task that every guard
 * built on `taskHeadings` cannot see, so the list is empty, or a pattern is wrong.
 */
export function unreadTaskIds(tracker: string): string[] {
  const readable = new RegExp(`^${TASK_ID}$`)
  return [...tracker.matchAll(/^#### \[.\] (\S+) · /gm)].map((match) => match[1]).filter((id) => !readable.test(id))
}

/** The tasks that `tracker` marks with one of `markers`: `x` is done and `=` is review, as in `markedTasks(tracker, 'x=')`. */
export function markedTasks(tracker: string, markers: string): string[] {
  return taskHeadings(tracker)
    .filter((heading) => markers.includes(heading.marker))
    .map((heading) => heading.id)
}

/** The tasks of a tracker's text: each id, with the text from its heading to the next heading. */
export function tasksIn(tracker: string): Map<string, string> {
  const tasks = new Map<string, string>()
  const task = new RegExp(`^#### \\[.\\] (${TASK_ID}) · `)
  const headings = [...tracker.matchAll(/^#{2,4} .*$/gm)]
  headings.forEach((heading, index) => {
    const id = task.exec(heading[0])?.[1]
    if (!id) return
    const start = heading.index ?? 0
    const end = headings[index + 1]?.index ?? tracker.length
    tasks.set(id, tracker.slice(start, end))
  })
  return tasks
}

/** TRACKER.md's tasks: each id, with the text from its heading to the next heading. */
export function trackerTasks(): Map<string, string> {
  return tasksIn(read('docs/TRACKER.md'))
}

/**
 * What ci.yml's `tests` job says about its shards: the numbers of its matrix, and the count that its command cuts the suite into. The
 * command is `bun run test --shard="$SHARD/<count>"`, with SHARD set from the matrix. Any other shape throws here, so a change to the
 * job is a change to these tests, and the tests that need the count never guess it.
 */
export function ciTestShards(): { matrix: number[]; count: number; command: string } {
  interface Job {
    strategy?: { matrix?: { shard?: number[] } }
    steps?: { env?: Record<string, string>; run?: string }[]
  }
  const job = (load(read('.github/workflows/ci.yml')) as { jobs?: Record<string, Job> }).jobs?.tests
  const command = job?.steps?.find((step) => step.env?.SHARD !== undefined)?.run?.trim() ?? ''
  const count = Number(/^bun run test --shard="\$SHARD\/(\d+)"$/.exec(command)?.[1])
  if (!Number.isInteger(count) || count < 2) throw new Error(`ci.yml's tests job does not run \`bun run test --shard="$SHARD/<count>"\`: "${command}"`)
  return { matrix: job?.strategy?.matrix?.shard ?? [], count, command }
}
