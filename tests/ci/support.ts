/*
 * What the CI tests share: reading the repository's documents, and picking tables and backticked names out of them. The
 * tests read ARCHITECTURE.md and TRACKER.md themselves, so a change to a document without the code, or the reverse, fails.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

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

/** TRACKER.md's tasks: each id, with the text from its heading to the next heading. */
export function trackerTasks(): Map<string, string> {
  const tasks = new Map<string, string>()
  const tracker = read('docs/TRACKER.md')
  const headings = [...tracker.matchAll(/^#{2,4} .*$/gm)]
  headings.forEach((heading, index) => {
    const id = /^#### \[.\] (W\d-T\d\d) · /.exec(heading[0])?.[1]
    if (!id) return
    const start = heading.index ?? 0
    const end = headings[index + 1]?.index ?? tracker.length
    tasks.set(id, tracker.slice(start, end))
  })
  return tasks
}
