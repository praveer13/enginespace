/*
 * The merge gate's refusal of a leaked path (W2b-T03). The repository is public: no local path, and no login name, may reach a committed
 * line or a pull request's text.
 *
 *   bun scripts/gate/paths.ts --base <ref> --head <ref> [--text <file>] [--repo <dir>]
 *
 * It reads the lines that the range adds, and every line of the text file when one is given (the pull request's title and body), and
 * exits 1 when one holds a home directory of the Linux or macOS kind, a scratch directory of the build agents, or the login name. The login
 * name is read from the environment when the gate runs (USER, LOGNAME, or the operating system's own answer) and is written nowhere in the
 * repository. A finding prints its place and what kind of path it was, and never the path itself, so that the log does not repeat the leak.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')

export interface Leak {
  /** A repository-relative path, or `text` for the pull request's text. */
  readonly where: string
  readonly line: number
  readonly what: string
}

/** The login names too short or too common to be told from a word. */
const IGNORED_NAMES = new Set(['root', 'runner', 'user', 'node', 'ubuntu', 'bun', 'ci'])

/** The login name of whoever runs the gate, or undefined when it cannot be told from a word. */
export function login(env: NodeJS.ProcessEnv = process.env): string | undefined {
  let name = env.USER || env.LOGNAME
  if (!name) {
    try {
      name = os.userInfo().username
    } catch {
      name = undefined
    }
  }
  if (!name || name.length < 4 || IGNORED_NAMES.has(name.toLowerCase())) return undefined
  return name
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** What a line leaks, as a list of kinds. */
export function leaks(text: string, name: string | undefined = login()): string[] {
  const kinds: string[] = []
  if (/\/home\/[A-Za-z0-9._-]+\//.test(text)) kinds.push('a Linux home directory')
  if (/\/Users\/[A-Za-z0-9._-]+\//.test(text)) kinds.push('a macOS home directory')
  if (new RegExp(`${'/tmp'}/claude`).test(text)) kinds.push('a build agent scratch directory')
  if (name && new RegExp(`(?<![A-Za-z0-9_])${escape(name)}(?![A-Za-z0-9_])`, 'i').test(text)) kinds.push('the login name')
  return kinds
}

/** The leaks in the added lines of a unified diff. */
export function diffLeaks(diff: string, name: string | undefined = login()): Leak[] {
  const out: Leak[] = []
  let file = ''
  let line = 0
  for (const raw of diff.split('\n')) {
    const header = /^\+\+\+ b\/(.*)$/.exec(raw)
    if (header) {
      file = header[1]
      continue
    }
    if (raw.startsWith('+++ ') || raw.startsWith('--- ')) continue
    const at = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw)
    if (at) {
      line = Number(at[1])
      continue
    }
    if (raw.startsWith('+')) {
      for (const what of leaks(raw.slice(1), name)) out.push({ where: file, line, what })
      line++
    }
  }
  return out
}

export function textLeaks(text: string, name: string | undefined = login()): Leak[] {
  const out: Leak[] = []
  text.split('\n').forEach((raw, at) => {
    for (const what of leaks(raw, name)) out.push({ where: 'text', line: at + 1, what })
  })
  return out
}

export function main(argv: string[]): number {
  const arg = (flag: string): string | undefined => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  const base = arg('--base')
  const head = arg('--head')
  const text = arg('--text')
  if ((!base || !head) && !text) {
    console.error('usage: bun scripts/gate/paths.ts --base <ref> --head <ref> [--text <file>] [--repo <dir>]')
    return 2
  }
  const found: Leak[] = []
  if (base && head) {
    const run = spawnSync('git', ['diff', '--no-color', '--no-renames', '--no-ext-diff', '-U0', `${base}...${head}`], { cwd: arg('--repo') ?? ROOT, encoding: 'utf8', maxBuffer: 1 << 29 })
    if (run.status !== 0) {
      console.error(`git diff failed: ${(run.stderr ?? '').trim()}`)
      return 2
    }
    found.push(...diffLeaks(run.stdout))
  }
  if (text) found.push(...textLeaks(readFileSync(text, 'utf8')))
  for (const leak of found) console.log(`${leak.where}:${leak.line} holds ${leak.what}`)
  if (found.length > 0) console.log(`# ${found.length} line(s) hold a local path or the login name: replace each with a repository-relative path or remove it`)
  return found.length > 0 ? 1 : 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
