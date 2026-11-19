/*
 * The merge gate's refusal of a lowered bar (W2b-T03). Wave R let three bars down quietly: a count of "> 40" became "> 20", a tolerance
 * of six digits became one, an assertion was dropped. This script lists every such line of a diff, and the merge script refuses the
 * branch unless the task's allow file names each one.
 *
 *   bun scripts/gate/bars.ts --base <ref> --head <ref> [--allow <file>] [--repo <dir>]
 *
 * It prints each finding on one line, '<kind> <repository-relative path>:<line> <the changed text, trimmed>', and exits 1 when any finding
 * is not matched by the allow file, 0 otherwise. The allow file is JSON: an array of { "path": "...", "contains": "..." }. A finding is
 * allowed when its path equals "path" and its text holds "contains".
 *
 * What it reads: the diff over tests/, e2e/, labs/grader/tests/, playwright.config.ts, scripts/verify-*.ts, scripts/content/, scripts/games/,
 * scripts/gate/, tests/seeds.ts and packages/sim/tensor/plan.ts. The kinds:
 *   number          a number inside an assertion (expect, assert) changed
 *   removed-expect  an expect or an assert that the head no longer holds
 *   timeout, retries, tolerance
 *                   a changed timeout, retries, tolerance, threshold or toBeCloseTo digit count; an added retries
 *   bound           a changed named bound: PACING, OPENER_WORDS, the blind-probe MIN_BLIND_SAMPLE, PR_SEEDS, NIGHTLY_SEEDS, MAX_SEEDS,
 *                   MAX_PLAN_NUMEL, the compiler's BUDGETS (page and index sizes), or any capitalised constant of a script whose number changed
 *   known-red       an entry added to scripts/gate/known-red.json (entries only leave it)
 *   skip            an added skip, fixme, todo, skipIf, skipUnless, importorskip or only, in an existing file and in a new one
 *   png             a baseline under e2e/**\/*-snapshots/ added, changed or deleted. It passes only when the allow file names it, the pull
 *                   request shows the diff image, and the coordinator has recorded that the owner looked at the old and the new picture.
 *   gate            a change under scripts/gate/ itself: a branch may not quietly weaken its own gate
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')

export type Kind = 'number' | 'removed-expect' | 'timeout' | 'retries' | 'tolerance' | 'bound' | 'known-red' | 'skip' | 'png' | 'gate'
export interface Finding {
  readonly kind: Kind
  readonly path: string
  readonly line: number
  readonly text: string
}
export interface Allow {
  readonly path: string
  readonly contains: string
}

/** The pathspecs that the diff is taken over. */
export const WATCHED: readonly string[] = [
  'tests/',
  'e2e/',
  'labs/grader/tests/',
  'playwright.config.ts',
  'scripts/verify-*.ts',
  'scripts/content/',
  'scripts/games/',
  'scripts/gate/',
  'packages/sim/tensor/plan.ts',
]

const KNOWN_RED = 'scripts/gate/known-red.json'
const PNG = /^e2e\/(?:.*\/)?[^/]*-snapshots\/.*\.png$/
/** Files in which every changed number is a bound. */
const ALL_BOUNDS = new Set(['scripts/content/pacing.ts', 'tests/seeds.ts'])

export function inScope(file: string): boolean {
  if (PNG.test(file)) return true
  return (
    file.startsWith('tests/') ||
    file.startsWith('e2e/') ||
    file.startsWith('labs/grader/tests/') ||
    file === 'playwright.config.ts' ||
    /^scripts\/verify-[^/]*\.ts$/.test(file) ||
    file.startsWith('scripts/content/') ||
    file.startsWith('scripts/games/') ||
    file.startsWith('scripts/gate/') ||
    file === 'packages/sim/tensor/plan.ts'
  )
}

interface Line {
  readonly n: number
  readonly text: string
}
interface Hunk {
  readonly removed: Line[]
  readonly added: Line[]
}
export interface FileDiff {
  readonly path: string
  readonly isNew: boolean
  readonly hunks: Hunk[]
}

/** The text of `git diff -U0` as files with hunks. Binary files carry no hunks. */
export function parseDiff(diff: string): FileDiff[] {
  const files: { path: string; isNew: boolean; hunks: Hunk[] }[] = []
  let file: { path: string; isNew: boolean; hunks: Hunk[] } | undefined
  let hunk: Hunk | undefined
  let oldN = 0
  let newN = 0
  for (const raw of diff.split('\n')) {
    const header = /^diff --git a\/(.*) b\/(.*)$/.exec(raw)
    if (header) {
      file = { path: header[2], isNew: false, hunks: [] }
      files.push(file)
      hunk = undefined
      continue
    }
    if (!file) continue
    if (hunk === undefined) {
      if (raw.startsWith('new file mode')) file.isNew = true
      const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
      if (at) {
        hunk = { removed: [], added: [] }
        file.hunks.push(hunk)
        oldN = Number(at[1])
        newN = Number(at[2])
      }
      continue
    }
    const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (at) {
      hunk = { removed: [], added: [] }
      file.hunks.push(hunk)
      oldN = Number(at[1])
      newN = Number(at[2])
    } else if (raw.startsWith('+') && !raw.startsWith('+++ ')) hunk.added.push({ n: newN++, text: raw.slice(1) })
    else if (raw.startsWith('-') && !raw.startsWith('--- ')) hunk.removed.push({ n: oldN++, text: raw.slice(1) })
  }
  return files
}

const COMMENT = /^\s*(?:\/\/|\/\*|\*|#)/
const ASSERTION = /\bexpect\s*\(|\.to[A-Z]\w*\s*\(|\bassert\w*\b|\bself\.assert\w*/
const EXPECT_START = /\bexpect\s*\(|\bassert\b|\bself\.assert\w*/
const SKIP = /\.skip\b|\bskip\s*\(|\.fixme\b|\bfixme\s*\(|\.todo\b|\bskipIf\b|\bskipUnless\b|\bimportorskip\b|\bskipTest\b|\bSkipTest\b|\bpytest\.mark\.skip|\bxit\s*\(|\bxdescribe\s*\(|\bxtest\s*\(|\.only\s*\(|\bunittest\.skip/
const NAMED = /\b(?:PACING|OPENER_WORDS|MIN_BLIND_SAMPLE|PR_SEEDS|NIGHTLY_SEEDS|MAX_SEEDS|MAX_PLAN_NUMEL|BUDGETS|MINUTES_TOLERANCE)\b/
const TOLERANCE = /toBeCloseTo|\btolerance\b|\bthreshold\b|\batol\b|\brtol\b|\bplaces\b|maxDiffPixel|\bepsilon\b|\bdelta\b|abs_tol|rel_tol/i
const SCREAMING = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/

const numbers = (text: string): string[] => [...text.matchAll(/(?<![\w.])\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map((match) => String(Number(match[0].replaceAll('_', ''))))
const shape = (text: string): string => text.replace(/(?<![\w.])\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?/gi, '#').replace(/\s+/g, ' ').trim()
const clip = (text: string): string => (text.length > 180 ? `${text.slice(0, 177)}...` : text)

/** The kind of a changed number on a line, or undefined when the line holds no bar. */
function classify(file: string, before: string, after: string): Kind | undefined {
  const both = `${before}\n${after}`
  if (NAMED.test(both) || ALL_BOUNDS.has(file)) return 'bound'
  if (TOLERANCE.test(both)) return 'tolerance'
  if (/\btimeout\b|setTimeout/i.test(both)) return 'timeout'
  if (/\bretries\b/.test(both)) return 'retries'
  if (ASSERTION.test(after) || ASSERTION.test(before)) return 'number'
  if (file.startsWith('scripts/') && SCREAMING.test(after)) return 'bound'
  return undefined
}

/** Every finding of one file's diff, except its PNG status, which is not a text diff. */
export function textFindings(diff: FileDiff): Finding[] {
  const file = diff.path
  const out: Finding[] = []
  const found = (kind: Kind, line: number, text: string) => out.push({ kind, path: file, line, text: clip(text.trim()) })
  const added = diff.hunks.map((hunk) => hunk.added.filter((line) => !COMMENT.test(line.text)))
  const removed = diff.hunks.map((hunk) => hunk.removed.filter((line) => !COMMENT.test(line.text)))

  // A line that moved inside the file is neither added nor removed.
  const pool = new Map<string, number>()
  for (const hunk of removed) for (const line of hunk) if (line.text.trim()) pool.set(line.text.trim(), (pool.get(line.text.trim()) ?? 0) + 1)
  const cancelled = new Set<Line>()
  for (const hunk of added)
    for (const line of hunk) {
      const left = pool.get(line.text.trim()) ?? 0
      if (left > 0) {
        pool.set(line.text.trim(), left - 1)
        cancelled.add(line)
      }
    }
  const gone = new Map<string, number>()
  for (const hunk of added) for (const line of hunk) if (cancelled.has(line)) gone.set(line.text.trim(), (gone.get(line.text.trim()) ?? 0) + 1)
  const keptRemoved = removed.map((hunk) =>
    hunk.filter((line) => {
      const left = gone.get(line.text.trim()) ?? 0
      if (left > 0) {
        gone.set(line.text.trim(), left - 1)
        return false
      }
      return true
    }),
  )
  const keptAdded = added.map((hunk) => hunk.filter((line) => !cancelled.has(line)))

  if (file === KNOWN_RED) {
    for (const hunk of keptAdded) for (const line of hunk) if (/"file"\s*:/.test(line.text)) found('known-red', line.n, line.text)
    return out
  }
  if (file.startsWith('scripts/gate/')) {
    const lines = keptAdded.flat().length + keptRemoved.flat().length
    if (lines > 0) found('gate', 1, 'the gate file changed')
  }
  if (PNG.test(file)) return out

  keptAdded.forEach((hunk, at) => {
    for (const line of hunk) if (SKIP.test(line.text)) found('skip', line.n, line.text)
    const gap = keptRemoved[at]
    const open = [...gap]
    const pairs: [Line, Line][] = []
    const lone: Line[] = []
    for (const line of hunk) {
      const twin = open.findIndex((other) => shape(other.text) === shape(line.text))
      if (twin >= 0) pairs.push([open.splice(twin, 1)[0], line])
      else lone.push(line)
    }
    if (open.length === lone.length) lone.forEach((line, i) => pairs.push([open[i], line]))
    else
      for (const line of lone)
        if (!diff.isNew && /\bretries\b\s*[:=(]\s*[1-9]/.test(line.text)) found('retries', line.n, line.text)
    const paired = new Set(pairs.map(([before]) => before))
    for (const [before, after] of pairs) {
      if (EXPECT_START.test(before.text) && !ASSERTION.test(after.text)) {
        found('removed-expect', before.n, `removed: ${before.text.trim()}`)
        continue
      }
      if (numbers(before.text).join(' ') === numbers(after.text).join(' ')) continue
      const kind = classify(file, before.text, after.text)
      if (kind) found(kind, after.n, `${after.text.trim()}  (was: ${before.text.trim()})`)
    }
    for (const line of gap) if (!paired.has(line) && EXPECT_START.test(line.text)) found('removed-expect', line.n, `removed: ${line.text.trim()}`)
  })
  return out
}

const git = (repo: string, args: string[]): string => {
  const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(run.stderr ?? '').trim()}`)
  return run.stdout
}

/** The baselines that the range adds, changes or deletes. */
export function pngFindings(nameStatus: string): Finding[] {
  const out: Finding[] = []
  for (const row of nameStatus.split('\n')) {
    const [status, file] = row.split('\t')
    if (!file || !PNG.test(file)) continue
    const what = status === 'A' ? 'added' : status === 'D' ? 'deleted' : 'changed'
    out.push({ kind: 'png', path: file, line: 0, text: `a baseline ${what}` })
  }
  return out
}

export function findings(diff: string, nameStatus: string): Finding[] {
  const out = parseDiff(diff).filter((file) => inScope(file.path)).flatMap(textFindings)
  out.push(...pngFindings(nameStatus))
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line))
}

export const allowed = (finding: Finding, allow: readonly Allow[]): boolean => allow.some((entry) => entry.path === finding.path && finding.text.includes(entry.contains))
export const render = (finding: Finding): string => `${finding.kind} ${finding.path}:${finding.line} ${finding.text}`

export function main(argv: string[]): number {
  const arg = (name: string): string | undefined => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const base = arg('--base')
  const head = arg('--head')
  if (!base || !head) {
    console.error('usage: bun scripts/gate/bars.ts --base <ref> --head <ref> [--allow <file>] [--repo <dir>]')
    return 2
  }
  const repo = arg('--repo') ?? ROOT
  const allowFile = arg('--allow')
  const allow: Allow[] = allowFile ? (JSON.parse(readFileSync(allowFile, 'utf8')) as Allow[]) : []
  const range = `${base}...${head}`
  const diff = git(repo, ['diff', '--no-color', '--no-renames', '--no-ext-diff', '-U0', range, '--', ...WATCHED])
  const names = git(repo, ['diff', '--no-renames', '--name-status', range, '--', 'e2e/'])
  const all = findings(diff, names)
  const refused = all.filter((finding) => !allowed(finding, allow))
  for (const finding of refused) console.log(render(finding))
  if (all.length > refused.length) console.log(`# ${all.length - refused.length} finding(s) allowed by the allow file`)
  if (refused.length > 0) console.log(`# ${refused.length} finding(s) refused: a bar, a skip, a baseline or a gate file changed that the allow file does not name`)
  return refused.length > 0 ? 1 : 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
