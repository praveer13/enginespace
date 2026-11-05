/*
 * W1-T04, accept 1 and 3: `verify:items` passes the reference family and fails the families that break its rules, among them one that
 * uses `Math.random`; and no key or solution is in the Markdown export. The gate runs here on trees of its own, in memory and as a
 * process: a fair family written with the framework's helpers, and a copy of it with one thing wrong for each rule of the gate.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { compileContent } from '../../scripts/content/build.ts'
import {
  checkItems,
  checkShape,
  checkTree,
  itemProblems,
  leakSentences,
  leaksIn,
  loadFamilies,
  readVectors,
  renderVectors,
  sourcesUnder,
  summaryLines,
  VECTORS_FILE,
  vectorsOf,
  withoutEntropy,
} from '../../scripts/verify-items.ts'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import { FAMILIES, plain } from '@es/play/items'
import type { Gen } from '@es/play/items'
import { toySum } from '../play/items-support.ts'

// The gate measures each family on a thousand banded seeds at four levels, which takes a second or two and several on a loaded host.
setDefaultTimeout(120_000)

const root = path.resolve(import.meta.dirname, '../..')
const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-items-'))
  scratch.push(dir)
  return dir
}

function put(dir: string, files: Record<string, string>): string {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  return dir
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A fair family, and what to break in it                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const ITEMS = path.join(root, 'packages/play/items/index.ts')
const SIM = path.join(root, 'packages/sim/core/index.ts')

const HOLES = {
  id: 'tr2.good',
  module: '',
  a: 'between(rng, 1000, 9999)',
  b: 'between(rng, 1000, 9999)',
  key: 'a + b',
  stem: "rich('Add the two numbers.')",
  givens: "[{ label: 'first', value: num(a, { unit: 'tokens' }) }, { label: 'second', value: num(b, { unit: 'tokens' }) }]",
  tolerance: '{}',
  band: '() => true',
  grade: 'gradeNumeric(item, response)',
  solution: "[{ text: rich('Add the first number to the second to get the total of both.'), result: num(item.answer.truth, { unit: 'tokens', tag: 'derived' }) }]",
  version: '1',
}
type Holes = typeof HOLES

/** The source of a family in a tree of its own. It imports the framework's helpers by path, so it is a family as W1-T14 will write one. */
function source(over: Partial<Holes> = {}): string {
  const h = { ...HOLES, ...over }
  return `import { between } from '${SIM}'
import { finishItem, gradeNumeric, itemRng, num, rich } from '${ITEMS}'
${h.module}
export const good = {
  id: '${h.id}',
  version: ${h.version},
  title: 'Good',
  kcs: ['tr2.bubble'],
  variants: [{ id: 'one', title: 'One', kcs: ['tr2.bubble'], levels: [0, 1, 2, 3] }],
  make(seed, level) {
    const rng = itemRng('${h.id}', 'one', level, seed, 'n')
    const a = ${h.a}
    const b = ${h.b}
    return finishItem(
      { id: '${h.id}', version: ${h.version} },
      {
        variant: 'one',
        level,
        seed,
        kcs: ['tr2.bubble'],
        stem: ${h.stem},
        givens: ${h.givens},
        worked: [],
        answer: { kind: 'numeric', label: 'the sum', unit: 'tokens', truth: ${h.key}, tolerance: ${h.tolerance} },
        params: { a, b },
      },
    )
  },
  band: ${h.band},
  grade(item, response) {
    return ${h.grade}
  },
  solution(item) {
    return ${h.solution}
  },
}
`
}

/** A tree whose items folder holds one family file, with the golden vectors already written for it. */
async function tree(over: Partial<Holes> = {}, vectors = true): Promise<string> {
  const dir = put(tempDir(), { 'packages/play/items/good.ts': source(over) })
  if (vectors) {
    const loaded = await loadFamilies(dir)
    put(dir, { [VECTORS_FILE]: renderVectors(loaded.families.map((entry) => entry.gen)) })
  }
  return dir
}

const codes = async (dir: string): Promise<string[]> => [...new Set((await checkTree(dir)).diagnostics.map((diagnostic) => diagnostic.code))].sort()

const gate = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-items.ts'), '--root', dir, ...args], { encoding: 'utf8' })
  return { status: result.status, out: result.stdout, err: result.stderr }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Accept 1                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('a sample family passes verify:items', () => {
  test('the families of this repository pass, with no error and nothing left unsaid', async () => {
    const result = await checkTree(root)
    expect(result.diagnostics).toEqual([])
    expect(result.notes).toEqual([])
    expect(result.families.map((family) => family.id)).toEqual(FAMILIES.map((family) => family.id))
    const lines = summaryLines(result)
    expect(lines[0]).toContain('tr2.bubble-width v1: 3 variants (async-off, async-on, close-it), levels 0 1 2 3')
    expect(lines.filter((line) => /^tr2\./.test(line)).map((line) => line.replace(/ \(.*$/, ''))).toEqual([
      'tr2.bubble-width v1: 3 variants',
      'tr2.graph-hit v1: 2 variants',
      'tr2.padding-waste v1: 3 variants',
    ])
    // Four levels of each family: W1-T14 measured the two it added on the same thousand banded seeds per level.
    expect(lines.filter((line) => line.startsWith('  level'))).toHaveLength(4 * FAMILIES.length)
    for (const line of lines.filter((candidate) => candidate.startsWith('  level'))) {
      expect(line).toMatch(/band \d+\.\d% of 2000, 1000 banded seeds, best blind strategy \d+\.\d% of a bound of \d+\.\d%/)
    }
  })

  test('as a process it prints the report, and exits 0', () => {
    const { status, out } = gate(root)
    expect(status).toBe(0)
    expect(out).toMatch(/verify:items passed: 3 famil\w+, 8 variants; each measured on 1000 banded seeds per level \[estimated\]/)
  })

  test('a fair family written as a later task will write one passes in a tree of its own', async () => {
    expect(await codes(await tree())).toEqual([])
  })
})

describe('a family using Math.random fails verify:items', () => {
  test('in the draw of its numbers: the source is refused, and so is the call, which throws when the gate makes Math.random throw', async () => {
    const dir = await tree({ a: 'Math.floor(Math.random() * 9000) + 1000' }, false)
    const result = await checkTree(dir)
    const found = result.diagnostics.map((diagnostic) => diagnostic.code)
    expect(found).toContain('nondeterministic-api')
    expect(found).toContain('make-throws')
    const lint = result.diagnostics.find((diagnostic) => diagnostic.code === 'nondeterministic-api')
    expect(lint?.message).toContain('Math.random is unseeded')
    expect(lint?.file).toBe('packages/play/items/good.ts')
    expect(lint?.line).toBeGreaterThan(1)
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'make-throws')?.message).toContain('Math.random was called')
  })

  test('as a process, the gate exits 1 and names the file, the line and the rule', async () => {
    const dir = await tree({ a: 'Math.floor(Math.random() * 9000) + 1000' }, false)
    const { status, out } = gate(dir)
    expect(status).toBe(1)
    expect(out).toMatch(/packages\/play\/items\/good\.ts:\d+: error nondeterministic-api: Math\.random is unseeded/)
    expect(out).toMatch(/verify:items failed: \d+ errors? in 1 file/)
  })

  test('used only where the call is never made at import, the source is still refused', async () => {
    // The call is made once, at import, before the gate makes it throw: only reading the source can see it.
    const dir = await tree({ module: 'const NOISE = Math.random()', a: 'between(rng, 1000, 9999) + (NOISE < 2 ? 0 : 1)' }, false)
    const found = await codes(dir)
    expect(found).toContain('nondeterministic-api')
    expect(found).not.toContain('make-throws')
  })

  test('in the band alone: the draw of a seed may not use it either, and the gate says the band throws', async () => {
    const dir = await tree({ band: '() => Math.random() < 0.9' }, false)
    const result = await checkTree(dir)
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(['nondeterministic-api', 'band-throws']))
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'band-throws')?.message).toContain('Math.random was called')
  })

  test('the clock and the entropy of the browser are refused the same way', async () => {
    for (const call of ['Date.now()', 'performance.now()', 'crypto.getRandomValues(new Uint32Array(1))[0]']) {
      const dir = await tree({ a: `between(rng, 1000, 9999) + (${call} < 0 ? 1 : 0)` }, false)
      const result = await checkTree(dir)
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('make-throws')
    }
  })

  test('state that leaks between calls shows as an item that changes on the second call', async () => {
    const dir = await tree({ module: 'let calls = 0', a: 'between(rng, 1000, 9999) + (calls += 1)' }, false)
    expect(await codes(dir)).toContain('non-deterministic')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* What else the gate refuses                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the other rules', () => {
  test('a key that is the same on every seed is passed by one constant', async () => {
    const dir = await tree({ key: '5000' })
    const result = await checkTree(dir)
    const row = result.diagnostics.find((diagnostic) => diagnostic.code === 'blind-strategy')
    expect(row?.message).toContain('always the same number, here 5000')
    expect(row?.message).toContain('passes 100.0%')
    expect(row?.message).toContain('over the bound of 15.0%')
  })

  test('a key that is printed on the ticket is passed by reading it off', async () => {
    const dir = await tree({ key: 'a' })
    const message = (await checkTree(dir)).diagnostics.find((diagnostic) => diagnostic.code === 'blind-strategy')?.message
    expect(message).toContain('the number printed as "first"')
  })

  test('a band that accepts about one seed in fifty is under the floor', async () => {
    const dir = await tree({ band: '(seed) => seed % 50 === 0' })
    const found = (await checkTree(dir)).diagnostics.find((diagnostic) => diagnostic.code === 'band-floor')
    expect(found?.message).toMatch(/accepts \d\.\d% of 2000 candidates at level 0, under the floor of 20%/)
  })

  test('a digit in a sentence is an untagged number', async () => {
    const dir = await tree({ stem: "rich('Add the 2 numbers.')" })
    const found = (await checkTree(dir)).diagnostics.find((diagnostic) => diagnostic.code === 'untagged-number')
    expect(found?.message).toContain('the stem holds the digits "2"')
  })

  test('a key that its own grade calls wrong, and a wrong number that it calls right', async () => {
    expect(await codes(await tree({ grade: "({ ok: false, score: 0, feedback: rich('No.') })" }))).toContain('grade-key')
    expect(await codes(await tree({ grade: "({ ok: true, score: 1, feedback: rich('Yes.') })" }))).toContain('grade-wrong')
  })

  test('a solution that ends in a number other than the key', async () => {
    const dir = await tree({ solution: "[{ text: rich('Add the first number to the second to get the total of both.'), result: num(item.answer.truth + 1, { unit: 'tokens', tag: 'derived' }) }]" })
    expect(await codes(dir)).toContain('solution-key')
  })

  test('a family that is not a Gen: an id that is not a family id, no version, a missing method', async () => {
    const dir = await tree({ id: 'bubble' }, false)
    expect(await codes(dir)).toContain('family-id')
    const shape = checkShape({ ...toySum, id: 'tr2.ok', version: 0, title: ' ', make: undefined as never, variants: [], kcs: [] }, 'x.ts')
    expect(shape.map((diagnostic) => diagnostic.code).sort()).toEqual(['family-kcs', 'family-method', 'family-title', 'family-variants', 'family-version'])
    const uncovered = checkShape({ ...toySum, kcs: ['tr2.bubble'] }, 'x.ts')
    expect(uncovered.map((diagnostic) => diagnostic.message).join('\n')).toContain('a variant assesses tr2.async-overlap')
  })

  test('two families with one id', async () => {
    const dir = put(tempDir(), { 'packages/play/items/a.ts': source(), 'packages/play/items/b.ts': source().replace('export const good', 'export const other') })
    const found = await loadFamilies(dir)
    expect(found.families).toHaveLength(2)
    expect((await checkTree(dir)).diagnostics.some((diagnostic) => diagnostic.code === 'family-id' && diagnostic.message.includes('is the family of'))).toBe(true)
  })

  test('a folder that is missing, one with no family, and a file that cannot be imported', async () => {
    expect((await loadFamilies(tempDir())).diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['no-folder'])
    const empty = put(tempDir(), { 'packages/play/items/index.ts': 'export const nothing = 1\n' })
    expect((await loadFamilies(empty)).diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['no-families'])
    const broken = put(tempDir(), { 'packages/play/items/boom.ts': "throw new Error('boom')\n" })
    const loaded = await loadFamilies(broken)
    expect(loaded.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message])).toEqual([['import', 'cannot be imported to read the families in it: boom']])
  })

  test('families are read alone, in an array and in a record, once each, and tests and declaration files are not sources', async () => {
    const dir = put(tempDir(), {
      'packages/play/items/one.ts': source({ id: 'tr2.one' }).replace('export const good', 'export const one'),
      'packages/play/items/many.ts': `import { one } from './one.ts'\nexport const FAMILIES = [one]\nexport const BY_ID = { one }\n`,
      'packages/play/items/x.test.ts': 'export const ignored = { kcs: ["tr2.bubble"], make() { return 1 } }\n',
      'packages/play/items/y.d.ts': 'export const ignored = 1\n',
    })
    expect(sourcesUnder(dir, 'packages/play/items')).toEqual(['packages/play/items/many.ts', 'packages/play/items/one.ts'])
    expect((await loadFamilies(dir)).families.map((entry) => [entry.gen.id, entry.file])).toEqual([['tr2.one', 'packages/play/items/one.ts']])
  })
})

describe('what is checked on one item', () => {
  const item = toySum.make(3, 2, 'sum')
  const problems = (change: Record<string, unknown>) => itemProblems(toySum, { ...item, ...change } as typeof item, { seed: 3, level: 2, variant: 'sum' })

  test('a made item has none', () => {
    expect(problems({})).toEqual([])
  })

  test.each([
    ['another family', { family: 'tr2.other' }, 'family is "tr2.other"'],
    ['another version', { version: 9 }, 'version is 9'],
    ['another seed', { seed: 4 }, 'seed is 4'],
    ['another level', { level: 3 }, 'level is 3'],
    ['a variant it lacks', { variant: 'nope' }, 'variant "nope" is not one of the family\'s'],
    ['a fingerprint that is not its own', { rev: '00000000' }, 'fingerprint'],
    ['an empty stem', { stem: [] }, 'stem is empty'],
    ['a given with no label', { givens: [{ label: '', value: { t: 'text', text: 'x' } }] }, 'a given has no label'],
    ['a given twice', { givens: [{ label: 'a', value: { t: 'text', text: 'x' } }, { label: 'a', value: { t: 'text', text: 'y' } }] }, 'appears twice'],
    ['a key that is not finite', { answer: { kind: 'numeric', label: 'n', unit: 'tokens', truth: Number.NaN, tolerance: {} } }, 'not a finite number'],
    ['no unit', { answer: { kind: 'numeric', label: 'n', unit: '', truth: 1, tolerance: {} } }, 'no unit'],
    ['a kind it cannot grade', { answer: { kind: 'essay' } }, 'neither numeric nor choice'],
  ])('refuses %s', (_, change, text) => {
    expect(problems(change).join('\n')).toContain(text)
  })

  test('refuses a choice with one option, a repeated id, a key that is no option, and an option with no why', () => {
    const choice = toySum.make(3, 2, 'larger')
    const spec = choice.answer
    if (spec.kind !== 'choice') throw new Error('a choice')
    const check = (answer: unknown) => itemProblems(toySum, { ...choice, answer } as typeof choice, { seed: 3, level: 2, variant: 'larger' }).join('\n')
    expect(check({ ...spec, options: [spec.options[0]] })).toContain('fewer than two options')
    expect(check({ ...spec, options: [spec.options[0], spec.options[0]] })).toContain('appears twice')
    expect(check({ ...spec, correct: 'zzz' })).toContain('is not one of the options')
    expect(check({ ...spec, options: spec.options.map((option) => ({ ...option, why: [] })) })).toContain('has no why')
  })
})

describe('the golden vectors', () => {
  test('are written by --write, and the gate holds the family to them', async () => {
    const dir = put(tempDir(), { 'packages/play/items/good.ts': source() })
    const missing = await checkTree(dir)
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['vectors-missing'])
    expect(missing.diagnostics[0].message).toContain('bun scripts/verify-items.ts --write')
    const written = gate(dir, '--write')
    expect(written.status).toBe(0)
    expect(written.out).toContain(`wrote ${VECTORS_FILE} for 1 family`)
    expect(existsSync(path.join(dir, VECTORS_FILE))).toBe(true)
    expect(await codes(dir)).toEqual([])
    expect(readVectors(dir).file?.families['tr2.good'].cases).toHaveLength(24)
  })

  test('a change to what a seed means moves them, and so does a version that was bumped without writing them again', async () => {
    // A module is imported once for a path, so each change is a tree of its own that holds the vectors of the family before it.
    const before = readFileSync(path.join(await tree(), VECTORS_FILE), 'utf8')
    const changed = put(tempDir(), { 'packages/play/items/good.ts': source({ key: 'a + b + 1' }), [VECTORS_FILE]: before })
    const moved = (await checkTree(changed)).diagnostics.find((diagnostic) => diagnostic.code === 'vectors-moved')
    expect(moved?.message).toMatch(/\d+ of 24 golden vectors moved \(first: seed 0, level 0\)/)
    const bumped = put(tempDir(), { 'packages/play/items/good.ts': source({ version: '2' }), [VECTORS_FILE]: before })
    expect((await checkTree(bumped)).diagnostics.map((diagnostic) => diagnostic.code)).toContain('vectors-version')
  })

  test('a family that is not in the file has none, and a file that is not the right one is refused', async () => {
    const dir = await tree({}, false)
    put(dir, { [VECTORS_FILE]: JSON.stringify({ schema: 'enginespace/item-vectors@1', families: {} }) })
    expect((await checkTree(dir)).diagnostics.map((diagnostic) => diagnostic.code)).toContain('vectors-missing')
    put(dir, { [VECTORS_FILE]: JSON.stringify({ schema: 'other' }) })
    expect((await checkTree(dir)).diagnostics.map((diagnostic) => diagnostic.code)).toContain('vectors-file')
    put(dir, { [VECTORS_FILE]: 'not json' })
    expect((await checkTree(dir)).diagnostics.map((diagnostic) => diagnostic.code)).toContain('vectors-file')
  })

  test('are a function of the family: the same bytes every time, at the fixed seeds, at every level', () => {
    const once = vectorsOf(bubbleWidth)
    expect(vectorsOf(bubbleWidth)).toEqual(once)
    expect(renderVectors([bubbleWidth])).toBe(renderVectors([bubbleWidth]))
    expect(once.cases.map((made) => made.level)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3])
    for (const made of once.cases) expect(made.sha256).toMatch(/^[0-9a-f]{64}$/)
    // The committed file is the family's, byte for byte.
    expect(readFileSync(path.join(root, VECTORS_FILE), 'utf8')).toBe(renderVectors(FAMILIES))
  })
})

describe('withoutEntropy', () => {
  test('makes Math.random, Date.now, performance.now and crypto.getRandomValues throw, and puts them back', () => {
    const before = [Math.random, Date.now, performance.now, crypto.getRandomValues]
    withoutEntropy(() => {
      expect(() => Math.random()).toThrow('Math.random was called')
      expect(() => Date.now()).toThrow('Date.now was called')
      expect(() => performance.now()).toThrow('performance.now was called')
      expect(() => crypto.getRandomValues(new Uint32Array(1))).toThrow('crypto.getRandomValues was called')
    })
    expect([Math.random, Date.now, performance.now, crypto.getRandomValues]).toEqual(before)
    expect(typeof Math.random()).toBe('number')
    // And it puts them back when the call throws.
    expect(() =>
      withoutEntropy(() => {
        throw new Error('inside')
      }),
    ).toThrow('inside')
    expect(Math.random).toBe(before[0])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Accept 3                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('no key or solution appears in the Markdown export', () => {
  const compiled = compileContent({ root })
  const exported = compiled.outputs.filter((output) => output.path.startsWith('public/md/') || output.path === 'public/llms.txt' || output.path.startsWith('src/content/generated/'))

  test('the sample lesson draws its items from the reference family, and the export names the block and nothing of its items', () => {
    const md = compiled.outputs.find((output) => output.path === 'public/md/tr2/l0-sample.md')?.text ?? ''
    expect(md).toContain('Items from the generator family `tr2.bubble-width`, level `2`, `3` per attempt, drawn on fresh seeds in the lesson.')
    expect(exported.length).toBeGreaterThan(5)
  })

  test('not one sentence of a solution or a why, at any level, of any family, is in the export, the index or the compiled lessons', () => {
    for (const gen of FAMILIES) {
      const sentences = leakSentences(gen)
      expect(sentences.size).toBeGreaterThan(20)
      expect(leaksIn(compiled.outputs, sentences)).toEqual([])
    }
  })

  test('the scan finds a sentence when one is there: the export of a lesson that quotes a solution is refused', () => {
    const sentences = leakSentences(bubbleWidth)
    const quoted = [...sentences.keys()].find((sentence) => !/\d/.test(sentence)) ?? ''
    expect(quoted.length).toBeGreaterThan(40)
    const found = leaksIn([{ path: 'public/md/tr2/l0-sample.md', text: `Some prose.\n\n${quoted.replace(/ /g, '  ')}\n` }], sentences)
    expect(found.map((leak) => [leak.file, leak.sentence])).toEqual([['public/md/tr2/l0-sample.md', quoted]])
    expect(leaksIn([{ path: 'content/modules/tr2/module.md', text: quoted }], sentences)).toEqual([])
    expect(leaksIn([{ path: 'public/llms.txt', text: 'nothing of the kind' }], sentences)).toEqual([])
  })

  test('the gate reads the export of a tree and fails a lesson that quotes a solution', async () => {
    const dir = await tree({}, true)
    cpSync(path.join(root, 'content'), path.join(dir, 'content'), { recursive: true })
    cpSync(path.join(root, 'public'), path.join(dir, 'public'), { recursive: true })
    const leak = 'Add the first number to the second to get the total of both.'
    const lesson = path.join(dir, 'content/modules/tr2/lessons/l0-sample.md')
    writeFileSync(lesson, `${readFileSync(lesson, 'utf8')}\n\n${leak}\n`)
    const result = await checkTree(dir)
    const leaks = result.diagnostics.filter((diagnostic) => diagnostic.code === 'leak')
    expect(leaks.map((diagnostic) => diagnostic.file)).toContain('public/md/tr2/l0-sample.md')
    expect(leaks[0].message).toContain('a solution step of one of tr2.good')
    expect(leaks[0].message).toContain('hold no key and no solution')
  })

  test('a tree without content has nothing to read, and says so; a tree with content that does not compile says to run verify:content', async () => {
    const bare = await checkTree(await tree())
    expect(bare.notes).toEqual(['there is no content/ in this tree, so the export was not read for leaks'])
    const dir = await tree()
    put(dir, { 'content/course.yaml': 'modules: nope\n' })
    expect((await checkTree(dir)).notes[0]).toContain('the content has errors')
  })

  test('the solutions the scan reads are the family\'s, in words that no lesson of the repository uses', () => {
    const sentences = leakSentences(bubbleWidth)
    expect([...sentences.values()].some((what) => what.startsWith('a solution step of'))).toBe(true)
    expect([...sentences.values()].some((what) => what.startsWith('the why of an option of'))).toBe(true)
    const solution = bubbleWidth.solution(bubbleWidth.make(1, 2, 'async-off'))
    expect(plain(solution[0].text).length).toBeGreaterThan(40)
  })
})

describe('as a process, a usage error', () => {
  test.each([[['--nope']], [['--root']], [['extra']]])('%p is exit 2', (args) => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-items.ts'), ...args], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('usage: bun scripts/verify-items.ts [--root <dir>] [--write]')
  })
})

describe('checkItems', () => {
  test('reports a problem once for each level, however many seeds make it', async () => {
    const dir = await tree({ stem: "rich('Add the 2 numbers.')" })
    const { families } = await loadFamilies(dir)
    const diagnostics = checkItems(families[0].gen as Gen, 'packages/play/items/good.ts').filter((diagnostic) => diagnostic.code === 'untagged-number')
    expect(diagnostics.map((diagnostic) => diagnostic.message.match(/one at level (\d)/)?.[1])).toEqual(['0', '1', '2', '3'])
  })
})
