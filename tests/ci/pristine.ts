/*
 * The unit job of ci.yml checks the commit out, installs and runs `bun test`: it builds nothing, so nothing that .gitignore lists exists
 * (src/content/generated/, public/claims.json, dist/, coverage/, .vite/). Every other gate runs in a tree where a build has left them, so
 * a test file that reads one of them passed everywhere but CI [measured 2026-11-18: tests/items/stems.test.ts on pull request #9's run,
 * ENOENT at import time]. A test gets the compiled course from the compiler in memory (`repoOutput` of tests/content/support.ts), or makes
 * the folder itself first and reads it back.
 *
 * The tests are in tests/ci/workflows.test.ts, beside the workflow they guard (a file of their own would shift the shards' dealing). What
 * this holds, precisely: a test file (under tests/, but for tests/fixtures/ and this file) that passes a path into a build output to
 * a file-system call or a path join, that is, a string in the call that holds `content/generated` or `claims.json`, or a join of the repo's
 * `repo` or `root` with `dist`, `coverage` or `.vite`, must also make something itself: it names one of `viteBuild` (a real build of the
 * repo), `writeOutputs` (the compiler's writer), `mkdtempSync`, `tempDir` or `project(` (a scratch project that the test then builds in).
 * A path passed to `output(result, '...')` or held in a constant is the name of an in-memory output, which is not a read, and is not
 * matched. The rule cannot see which file a test file reads that another file wrote, so it does not call that right: it only requires the
 * file to have a producer of its own. A run of each such file alone from an export of the commit is the proof for the rest.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { root } from './support'

const SELF = 'tests/ci/pristine.ts'

/** A call that takes a path into a build output as an argument. Comments are removed before it is matched. */
const READS_OUTPUT =
  /\b(?:readFileSync|readdirSync|existsSync|statSync|join|resolve)\s*\([^)]*(?:content\/generated|claims\.json|(?:\b(?:repo|root)\b[^)]*['"`](?:dist|coverage|\.vite)['"`]))/

/** What a file does to make the output before it reads it. */
const MAKES_ITS_OWN = /\b(?:viteBuild|writeOutputs|mkdtempSync|tempDir)\b|\bproject\(/

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** The files that read a build output without making it: path from the repo root. */
export function readersWithoutProducer(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([, text]) => {
      const code = withoutComments(text)
      return READS_OUTPUT.test(code) && !MAKES_ITS_OWN.test(code)
    })
    .map(([file]) => file)
}

export function testSources(): Record<string, string> {
  const found: Record<string, string> = {}
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && next !== 'tests/fixtures') walk(next)
      } else if (/\.[cm]?[jt]sx?$/.test(entry.name) && next !== SELF) found[next] = readFileSync(path.join(root, next), 'utf8')
    }
  }
  walk('tests')
  return found
}

/** Sources for the tests of the rule: what tests/items/stems.test.ts was, a read of the claims and a read of dist/, each with nothing that makes it. */
export const SAMPLES = {
  stems: `import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const dir = join(import.meta.dir, '../../src/content/generated/lessons')
for (const name of readdirSync(dir)) JSON.parse(readFileSync(join(dir, name), 'utf8'))`,
  claims: "const claims = JSON.parse(readFileSync(path.join(root, 'public/claims.json'), 'utf8'))",
  dist: "const html = readFileSync(path.join(root, 'dist', 'index.html'), 'utf8')",
  inMemory: "const text = repoOutput('src/content/generated/index.json')",
  commented: "// readFileSync(join(root, 'src/content/generated/x'))\nconst x = 1",
}
