/*
 * W1-T35, the Markdown export and llms.txt (ARCHITECTURE §4.6, §4.7 and §10.1; ASSESSMENT §10).
 *
 * public/md/** and public/llms.txt are the learner's agent's export. The compiler writes them from content/, and they are committed.
 *
 *   Acceptance 2, a stale export fails the freshness check. The check is that the commit holds exactly the files the compiler writes
 *   today, with the bytes it writes: no file missing from the commit, none left that the compiler no longer writes. It runs in three
 *   places, and each is tried on a stale export here:
 *     - in memory, against the repository: `bun test` runs it, so the merge gates and CI's tests job fail on a stale export;
 *     - on a lesson that was edited without writing the export again;
 *     - as the Export freshness step of ci.yml and deploy.yml, which runs as a shell script in a scratch repository.
 *
 *   Acceptance 1, no solution or key field is in the export. The committed files are searched for a sentence of any solution or any
 *   "why" of the item families, and for a line that serializes a field that carries a key; and no block of the content has such a field
 *   for the export to pass on. Each search is tried on an export that has what it looks for.
 *
 * Every test that changes anything changes a copy: a map in memory, a copy of content/ or a scratch repository.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { GAMES } from '@es/play'
import { FAMILIES } from '@es/play/items'
import { compileContent } from '../../scripts/content/build.ts'
import type { CompileResult, Output } from '../../scripts/content/build.ts'
import { leakSentences, leaksIn } from '../../scripts/verify-items.ts'
import { BLOCK_TYPES } from '../../packages/schema/content.ts'
import { project, repo, REPO_LESSONS, REPO_MODULES, tempDir } from './support.ts'

/** These tests start git and bash a few times each, which a busy machine can stretch past bun's 5 s default. */
const SLOW = 60_000

/* ------------------------------------------------------------------------------------------------------------------ */
/* The export, and what makes it stale                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

const isExport = (file: string): boolean => file.startsWith('public/md/') || file === 'public/llms.txt'
const exportOf = (result: CompileResult): Output[] => result.outputs.filter((output) => isExport(output.path))
const FIX = 'run bun scripts/content/build.ts and commit public/md and public/llms.txt'

interface Staleness {
  /** Files in the commit whose bytes are not the compiler's. */
  changed: string[]
  /** Files the compiler writes that the commit does not hold. */
  missing: string[]
  /** Files the commit holds that the compiler no longer writes. */
  extra: string[]
}

function staleness(expected: readonly Output[], committed: ReadonlyMap<string, string>): Staleness {
  const wanted = new Map(expected.map((output) => [output.path, output.text]))
  return {
    changed: [...wanted].filter(([file, text]) => committed.has(file) && committed.get(file) !== text).map(([file]) => file),
    missing: [...wanted.keys()].filter((file) => !committed.has(file)),
    extra: [...committed.keys()].filter((file) => !wanted.has(file)),
  }
}

/** What a failed check says: each file, and the fix. It is empty when nothing is stale, so `expect(report(...)).toBe('')` prints it. */
function report(stale: Staleness): string {
  const lines = [
    ...stale.changed.map((file) => `${file} is not what the compiler writes`),
    ...stale.missing.map((file) => `${file} is not committed`),
    ...stale.extra.map((file) => `${file} is committed, and the compiler does not write it`),
  ]
  return lines.length === 0 ? '' : `the committed Markdown export is stale: ${FIX}\n${lines.join('\n')}`
}

/**
 * The export as a commit holds it: the files that git tracks under public/md and public/llms.txt, with the bytes the tree has for them. A
 * file that is on disk and that git does not track is not committed, and a file that git tracks and the tree lacks is not read.
 */
function committedExport(dir: string): Map<string, string> {
  const run = spawnSync('git', ['-C', dir, 'ls-files', '-z', '--', 'public/md', 'public/llms.txt'], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git ls-files failed in ${dir}: ${run.stderr}`)
  const files = new Map<string, string>()
  for (const file of run.stdout.split('\0').filter((name) => name !== '')) {
    if (existsSync(path.join(dir, file))) files.set(file, readFileSync(path.join(dir, file), 'utf8'))
  }
  return files
}

const compiled = compileContent({ root: repo })
const expected = exportOf(compiled)
const committed = committedExport(repo)
/** The first lesson of the export, as the path the compiler gives it: `public/md/<module>/<slug>.md`. */
const lessonFile = expected.find((output) => output.path.startsWith('public/md/') && !output.path.endsWith('/index.md'))?.path ?? ''
/** The first module's overview: `public/md/<module>/index.md`. */
const overviewFile = expected.find((output) => output.path.endsWith('/index.md'))?.path ?? ''

describe('the committed export is the compiler\'s output (acceptance 2)', () => {
  test('the repository compiles, and the export is llms.txt, an overview of each module and a file for each lesson', () => {
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(expected.map((output) => output.path)).toContain('public/llms.txt')
    expect(expected).toHaveLength(1 + REPO_MODULES + REPO_LESSONS)
    expect([lessonFile, overviewFile].map((file) => file !== '')).toEqual([true, true])
  })

  test('the commit holds exactly the files the compiler writes, with the bytes it writes', () => {
    expect(report(staleness(expected, committed))).toBe('')
  })

  const held = (): Map<string, string> => new Map(expected.map((output) => [output.path, output.text]))

  test('the check finds a file that was edited, one the commit lacks and one that is left over, and it reads bytes', () => {
    expect(staleness(expected, held())).toEqual({ changed: [], missing: [], extra: [] })

    const edited = held().set(lessonFile, `${held().get(lessonFile)}A sentence that the compiler does not write.\n`)
    expect(staleness(expected, edited)).toEqual({ changed: [lessonFile], missing: [], extra: [] })

    const reflowed = held().set(overviewFile, (held().get(overviewFile) ?? '').replace(/\n$/, ''))
    expect(staleness(expected, reflowed)).toEqual({ changed: [overviewFile], missing: [], extra: [] })

    const lacking = held()
    lacking.delete('public/llms.txt')
    expect(staleness(expected, lacking)).toEqual({ changed: [], missing: ['public/llms.txt'], extra: [] })

    const leftover = held().set('public/md/tr2/l9-gone.md', '# A lesson that was taken out\n')
    expect(staleness(expected, leftover)).toEqual({ changed: [], missing: [], extra: ['public/md/tr2/l9-gone.md'] })
  })

  test('a failed check names each file and the fix, and says nothing when nothing is stale', () => {
    expect(report(staleness(expected, held()))).toBe('')
    const stale = held().set(lessonFile, 'not the lesson\n').set('public/md/tr2/l9-gone.md', '#\n')
    stale.delete('public/llms.txt')
    const message = report(staleness(expected, stale))
    expect(message).toContain(`the committed Markdown export is stale: ${FIX}`)
    expect(message).toContain(`${lessonFile} is not what the compiler writes`)
    expect(message).toContain('public/llms.txt is not committed')
    expect(message).toContain('public/md/tr2/l9-gone.md is committed, and the compiler does not write it')
  })

  test('a lesson edited without writing the export again leaves a fresh export stale in that lesson alone', () => {
    const dir = tempDir('export-edit')
    cpSync(path.join(repo, 'content'), path.join(dir, 'content'), { recursive: true })
    cpSync(path.join(repo, 'course.lock.json'), path.join(dir, 'course.lock.json'))
    cpSync(path.join(repo, 'public/figures'), path.join(dir, 'public/figures'), { recursive: true })
    const [module, slug] = lessonFile.replace(/^public\/md\//, '').replace(/\.md$/, '').split('/')
    const source = path.join(dir, 'content/modules', module, 'lessons', `${slug}.md`)
    writeFileSync(source, `${readFileSync(source, 'utf8').trimEnd()}\n\nThis sentence is in the lesson, and the committed export does not have it.\n`)

    const edited = compileContent({ root: dir })
    expect(edited.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    const stale = staleness(exportOf(edited), held())
    expect(stale).toEqual({ changed: [lessonFile], missing: [], extra: [] })
    expect(report(stale)).toContain(`${lessonFile} is not what the compiler writes`)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The Export freshness step of the workflows                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the Export freshness step of ci.yml and deploy.yml (acceptance 2)', () => {
  interface Step {
    name?: string
    run?: string
  }
  const stepsOf = (file: string, job: string): Step[] => {
    const workflow = load(readFileSync(path.join(repo, '.github/workflows', file), 'utf8')) as { jobs: Record<string, { steps: Step[] }> }
    return workflow.jobs[job].steps
  }
  const where = [
    ['ci.yml', 'fast-gate'],
    ['deploy.yml', 'build'],
  ] as const
  const scriptOf = (file: string, job: string): string => stepsOf(file, job).find((step) => step.name === 'Export freshness')?.run ?? ''

  test('both workflows have it, with one script, after the build that writes the export again', () => {
    for (const [file, job] of where) {
      const steps = stepsOf(file, job)
      const at = steps.findIndex((step) => step.name === 'Export freshness')
      const built = steps.findIndex((step) => step.run?.trim() === 'npm run build')
      expect([file, built >= 0, at > built]).toEqual([file, true, true])
    }
    expect(scriptOf('deploy.yml', 'build')).toBe(scriptOf('ci.yml', 'fast-gate'))
  })

  test('it does not wait for a task any more: nothing in it is pending', () => {
    for (const [file, job] of where) {
      const script = scriptOf(file, job)
      expect([file, script !== '', script.includes('pending')]).toEqual([file, true, false])
    }
  })

  /** git for the scratch repository: a throwaway identity, no signing, no hooks, and none of the machine's configuration. */
  const ENV = { PATH: process.env.PATH ?? '', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C' }
  function git(cwd: string, ...args: string[]): string {
    const run = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', env: ENV })
    if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`)
    return run.stdout.trim()
  }
  /** The step as a runner runs it: a bash script, with `-e` and pipefail, in the root of the checkout. */
  function runStep(cwd: string): { code: number | null; out: string } {
    const run = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', scriptOf('ci.yml', 'fast-gate')], { cwd, encoding: 'utf8', env: ENV })
    return { code: run.status, out: `${run.stdout}${run.stderr}` }
  }
  function writeExport(dir: string): void {
    for (const output of expected) {
      mkdirSync(path.dirname(path.join(dir, output.path)), { recursive: true })
      writeFileSync(path.join(dir, output.path), output.text)
    }
  }
  /** A checkout whose commit holds the export as the compiler writes it. */
  function checkout(label: string): string {
    const dir = tempDir(label)
    git(dir, 'init', '-q')
    writeFileSync(path.join(dir, 'README.md'), 'A scratch repository.\n')
    writeExport(dir)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'the export')
    return dir
  }
  /** Puts the tree back to the commit, as a fresh checkout. */
  const reset = (dir: string): void => {
    git(dir, 'checkout', '-q', '--', '.')
    git(dir, 'clean', '-fdq')
  }

  test('passes on a checkout whose commit holds the export the compiler writes, and prints nothing', () => {
    const dir = checkout('export-fresh')
    expect(runStep(dir)).toEqual({ code: 0, out: '' })
  }, SLOW)

  test('fails when the compiler rewrote a file of the export: the build changed what the commit holds', () => {
    const dir = checkout('export-edited')
    for (const file of [lessonFile, overviewFile, 'public/llms.txt']) {
      writeFileSync(path.join(dir, file), `${readFileSync(path.join(dir, file), 'utf8')}A line that the commit does not have.\n`)
      const { code, out } = runStep(dir)
      expect([file, code]).toEqual([file, 1])
      expect(out).toContain(` M ${file}`)
      expect(out).toContain(`::error title=Export freshness::the committed Markdown export is stale: ${FIX}`)
      reset(dir)
    }
    expect(runStep(dir).code).toBe(0)
  }, SLOW)

  test('fails when the compiler wrote a file the commit lacks, or removed one the commit holds', () => {
    const dir = checkout('export-files')
    const added = 'public/md/tr2/l8-written-after-the-commit.md'
    mkdirSync(path.dirname(path.join(dir, added)), { recursive: true })
    writeFileSync(path.join(dir, added), '# A lesson written after the commit\n')
    const grew = runStep(dir)
    expect([grew.code, grew.out.includes(`?? ${added}`), grew.out.includes('Export freshness::the committed Markdown export is stale')]).toEqual([1, true, true])
    reset(dir)

    rmSync(path.join(dir, lessonFile))
    const shrank = runStep(dir)
    expect([shrank.code, shrank.out.includes(` D ${lessonFile}`), shrank.out.includes('Export freshness::the committed Markdown export is stale')]).toEqual([1, true, true])
  }, SLOW)

  test('fails when the commit does not hold the export at all: it is written and never committed', () => {
    const dir = tempDir('export-untracked')
    git(dir, 'init', '-q')
    writeFileSync(path.join(dir, 'README.md'), 'A scratch repository.\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'start')
    writeExport(dir)
    const { code, out } = runStep(dir)
    expect(code).toBe(1)
    expect(out).toContain(`::error title=Export freshness::the Markdown export is not committed: ${FIX}`)
  }, SLOW)
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* No key and no solution                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The names of the fields that carry a key or a solution: an item's `truth` (a number) and `correct` (an option), an option's `why` and
 * `miss`, a family's `solution`, a game's `ghost` (its reference run), and the words that a key goes by. `answer` is not one: a
 * prediction's `answer` is the shape of an answer and holds no value (packages/schema/content.ts).
 */
const KEY_FIELDS = ['key', 'keys', 'answerKey', 'answer_key', 'solution', 'solutions', 'truth', 'correct', 'why', 'miss', 'ghost']
/** The fences that hold data. A fence of source that a lesson quotes (python, sh) is prose's to read: an engine has fields of its own. */
const DATA_FENCES = ['json', 'jsonc', 'yaml', 'yml', 'toml']

/**
 * The lines of an export that serialize a field named for a key: `"truth": 12` anywhere, or a line that starts with `solution:` or
 * `correct =`, in a list or a quote or on its own. Prose is read as prose ("Dispatch keys: which graph replays this step" is a title),
 * and so is the source a lesson quotes.
 */
function keyFieldLines(text: string): number[] {
  const names = KEY_FIELDS.join('|')
  const quoted = new RegExp(`"(?:${names})"\\s*:`)
  const bare = new RegExp(`^[\\s>]*(?:[-*+]\\s+)?(?:${names})\\s*[:=]`)
  const found: number[] = []
  let fence: string | null = null
  text.split('\n').forEach((line, index) => {
    const marker = /^[\s>]*```(\S*)/.exec(line)
    if (marker !== null) {
      fence = fence === null ? marker[1].toLowerCase() : null
      return
    }
    if (fence !== null && !DATA_FENCES.includes(fence)) return
    if (quoted.test(line) || bare.test(line)) found.push(index + 1)
  })
  return found
}

describe('no solution or key field is in the export (acceptance 1)', () => {
  const files = [...committed].map(([file, text]) => ({ path: file, text }))
  const lesson = files.find((file) => file.path === lessonFile) ?? { path: lessonFile, text: '' }

  test('the export under search is the committed one: llms.txt, the overviews and the lessons', () => {
    expect(files).toHaveLength(1 + REPO_MODULES + REPO_LESSONS)
    expect(lesson.text.length).toBeGreaterThan(1000)
  })

  const sentences = new Map<string, string>()
  for (const gen of FAMILIES) for (const [sentence, what] of leakSentences(gen)) if (!sentences.has(sentence)) sentences.set(sentence, `${what} of ${gen.id}`)

  test('not one sentence of a solution step or of a "why" of any item family, at any level, is in a committed file', () => {
    expect(FAMILIES.length).toBeGreaterThan(5)
    expect(sentences.size).toBeGreaterThan(500)
    expect(leaksIn(files, sentences)).toEqual([])
  })

  test('the search finds a sentence when one is there: a committed lesson that quotes a solution is refused', () => {
    const quoted = [...sentences.keys()].find((sentence) => sentence.length > 60 && !/\d/.test(sentence)) ?? ''
    expect(quoted).not.toBe('')
    const found = leaksIn([{ path: lesson.path, text: `${lesson.text}\n${quoted}\n` }], sentences)
    expect(found.map((leak) => [leak.file, leak.sentence])).toEqual([[lesson.path, quoted]])
    // llms.txt is read too, and a file that is not part of the export is not.
    expect(leaksIn([{ path: 'public/llms.txt', text: quoted }], sentences)).toHaveLength(1)
    expect(leaksIn([{ path: 'content/modules/tr2/module.md', text: quoted }], sentences)).toEqual([])
  })

  test('no line of a committed file serializes a field that carries a key or a solution', () => {
    expect(files.flatMap((file) => keyFieldLines(file.text).map((line) => `${file.path}:${line}`))).toEqual([])
  })

  test('the search finds a field when one is there, and reads prose and quoted source as what they are', () => {
    expect(keyFieldLines('{"answer": {"kind": "numeric", "truth": 188}}')).toEqual([1])
    expect(keyFieldLines('solution: three steps')).toEqual([1])
    expect(keyFieldLines('> - correct: opt-b')).toEqual([1])
    expect(keyFieldLines('Some prose.\n\n```yaml\nwhy = because\n```\n')).toEqual([4])
    expect(keyFieldLines(`${lesson.text}\n\`\`\`json\n{"truth": 188}\n\`\`\`\n`)).toHaveLength(1)
    expect(keyFieldLines('# Dispatch keys: which graph replays this step\n\n```python\nkey: int = 0\n```\n\nThe key is the pair.\n')).toEqual([])
  })

  test('no block of the content has a field that carries a key, so there is none for the export to pass on', () => {
    // The repository's lessons, and the sample course's, which has one lesson that uses every directive.
    const seen = new Map<string, Set<string>>()
    const walk = (value: unknown, type: string): void => {
      if (Array.isArray(value)) value.forEach((entry) => walk(entry, type))
      else if (value !== null && typeof value === 'object') {
        for (const [field, inner] of Object.entries(value)) {
          if (!seen.has(type)) seen.set(type, new Set())
          seen.get(type)?.add(field)
          walk(inner, type)
        }
      }
    }
    for (const result of [compiled, compileContent({ root: project() })]) {
      for (const output of result.outputs) {
        if (!/^src\/content\/generated\/(?:lessons|modules)\//.test(output.path)) continue
        for (const block of (JSON.parse(output.text) as { blocks?: { type: string }[] }).blocks ?? []) walk(block, block.type)
      }
    }
    expect([...seen.keys()].sort()).toEqual([...BLOCK_TYPES].sort())
    expect([...seen].flatMap(([type, fields]) => [...fields].filter((field) => KEY_FIELDS.includes(field)).map((field) => `${type}.${field}`))).toEqual([])
  })

  test('the names are the contracts\' own: an item\'s truth and correct, an option\'s why and miss, a family\'s solution, a game\'s ghost', async () => {
    const names = new Set<string>()
    for (const gen of FAMILIES) {
      for (const level of [0, 1, 2, 3] as const) {
        for (let seed = 1; seed <= 6; seed += 1) {
          const { answer } = gen.make(seed, level)
          Object.keys(answer).forEach((name) => names.add(name))
          if (answer.kind === 'choice') answer.options.forEach((option) => Object.keys(option).forEach((name) => names.add(name)))
        }
      }
    }
    for (const name of ['truth', 'correct', 'why', 'miss']) expect([name, names.has(name)]).toEqual([name, true])
    expect(KEY_FIELDS).toEqual(expect.arrayContaining(['truth', 'correct', 'why', 'miss', 'solution', 'ghost']))
    expect(FAMILIES.every((gen) => typeof gen.solution === 'function')).toBe(true)
    expect(GAMES.games.length).toBeGreaterThan(3)
    for (const game of GAMES.games) expect([game.id, typeof (await game.session()).ghost]).toEqual([game.id, 'function'])
    // `answer` is the shape of a prediction's answer: kind, unit, tolerance and options, and no value.
    expect(KEY_FIELDS).not.toContain('answer')
  })
})
