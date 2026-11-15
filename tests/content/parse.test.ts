/*
 * Reading a content file (ARCHITECTURE §4.2): the front matter, the directives, the YAML and the line of every key.
 */
import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { ESLint } from 'eslint'
import { z } from 'zod'
import { blockBodySchemas } from '@es/schema'
import { formatDiagnostic, loadYaml, locate, parseContentFile, schemaDiagnostics } from '../../scripts/content/parse.ts'
import type { Diagnostic } from '../../scripts/content/parse.ts'
import { holdStackHook, setStackHook } from '../lint/stack-hook'

/** Four lines. What follows starts on line five. */
const FRONT = '---\nid: tr2.l0\nmodule: tr2\n---'

function parse(source: string) {
  const out: Diagnostic[] = []
  const file = parseContentFile('x.md', source, out)
  return { file, out: out.map((d) => `${d.line} ${d.code}`), diagnostics: out }
}

describe('front matter', () => {
  test('is the YAML between the first line of three hyphens and the next', () => {
    const { file, out } = parse(`${FRONT}\n\nBody.\n`)
    expect(out).toEqual([])
    expect(file?.frontMatter).toEqual({ id: 'tr2.l0', module: 'tr2' })
    expect(file?.frontMatterText).toBe('id: tr2.l0\nmodule: tr2')
    expect(file?.frontMatterLine).toBe(2)
  })

  test('is required, and is closed', () => {
    expect(parse('Body.\n').out).toEqual(['1 no-front-matter'])
    expect(parse('Body.\n').file).toBeNull()
    expect(parse('---\nid: x\nBody.\n').out).toEqual(['1 no-front-matter'])
    expect(parse('').out).toEqual(['1 no-front-matter'])
  })

  test('is a mapping', () => {
    expect(parse('---\njust words\n---\nBody.\n').out).toEqual(['2 front-matter'])
    expect(parse('---\n- a\n- b\n---\n').out).toEqual(['2 front-matter'])
    expect(parse('---\n---\nBody.\n').out).toEqual(['2 front-matter'])
  })

  test('reports a YAML error on the line it is on, and still splits the body', () => {
    const { out, file } = parse('---\nid: ok\nkcs: [a, b\ntitle: x\n---\n\n:::game\nid: loop\n:::\n')
    expect(out).toEqual(['4 bad-yaml'])
    expect(file?.frontMatter).toBeUndefined()
    expect(file?.segments.map((s) => s.kind)).toEqual(['directive'])
  })

  test('refuses a key written twice', () => {
    expect(parse('---\nid: a\nid: b\n---\n').out).toEqual(['3 bad-yaml'])
  })

  test('keeps a bare date a string', () => {
    expect(parse('---\nwhen: 2026-11-03\nyes: no\n---\n').file?.frontMatter).toEqual({ when: '2026-11-03', yes: 'no' })
  })

  test('survives a byte order mark and Windows line endings', () => {
    const { file, out } = parse(`\uFEFF---\r\nid: a\r\n---\r\n\r\nWords.\r\n\r\n:::game\r\nid: loop\r\n:::\r\n`)
    expect(out).toEqual([])
    expect(file?.frontMatter).toEqual({ id: 'a' })
    expect(file?.segments).toEqual([
      { kind: 'prose', line: 4, md: '\nWords.\n' },
      { kind: 'directive', name: 'game', line: 7, bodyLine: 8, yaml: 'id: loop' },
    ])
  })
})

describe('the body', () => {
  test('is prose and directives in order, each with its line', () => {
    const source = `${FRONT}\n\nFirst.\n\n:::predict\nid: tr2.l0.p1\nprompt: Why?\n:::\n\nSecond.\n\n:::game\n:::\n`
    const { file, out } = parse(source)
    expect(out).toEqual([])
    expect(file?.segments).toEqual([
      { kind: 'prose', line: 5, md: '\nFirst.\n' },
      { kind: 'directive', name: 'predict', line: 8, bodyLine: 9, yaml: 'id: tr2.l0.p1\nprompt: Why?' },
      { kind: 'prose', line: 12, md: '\nSecond.\n' },
      { kind: 'directive', name: 'game', line: 15, bodyLine: 16, yaml: '' },
    ])
  })

  test('drops prose that is only blank lines', () => {
    const { file } = parse(`${FRONT}\n\n\n:::game\n:::\n\n\n:::item\n:::\n\n`)
    expect(file?.segments.map((s) => s.kind)).toEqual(['directive', 'directive'])
  })

  test('does not read a fenced code block as a directive', () => {
    const source = [FRONT, '', 'Before.', '', '```markdown', ':::game', 'id: loop', ':::', '```', '', '~~~~', ':::lab', '~~~', ':::lab', '~~~~', '', 'After.'].join('\n')
    const { file, out } = parse(source)
    expect(out).toEqual([])
    expect(file?.segments).toHaveLength(1)
    expect(file?.segments[0]).toMatchObject({ kind: 'prose' })
  })

  test('reads a directive after a fence closes', () => {
    const source = [FRONT, '', '```', 'x', '```', ':::game', 'id: loop', ':::'].join('\n')
    expect(parse(source).file?.segments.map((s) => s.kind)).toEqual(['prose', 'directive'])
  })

  test('does not take a line of ticks with a tick after it for a fence', () => {
    const source = [FRONT, '', '``` is not `a fence`', ':::game', ':::'].join('\n')
    expect(parse(source).file?.segments.map((s) => s.kind)).toEqual(['prose', 'directive'])
  })

  test('says where a directive was never closed', () => {
    expect(parse(`${FRONT}\n\n:::game\nid: loop\n`).out).toEqual(['6 unclosed-directive'])
  })

  test('says where one opens inside another', () => {
    const { out, file } = parse(`${FRONT}\n\n:::game\nid: loop\n:::item\n:::\n`)
    expect(out).toEqual(['8 nested-directive'])
    expect(file?.segments).toEqual([{ kind: 'directive', name: 'game', line: 6, bodyLine: 7, yaml: 'id: loop' }])
  })

  test('says where a closer has nothing to close, and where an opener is malformed', () => {
    expect(parse(`${FRONT}\n\n:::\n`).out).toEqual(['6 stray-fence'])
    expect(parse(`${FRONT}\n\n:::game extra\n:::\n`).out).toEqual(['6 bad-directive', '7 stray-fence'])
    expect(parse(`${FRONT}\n\n::: game\n`).out).toEqual(['6 bad-directive'])
    expect(parse(`${FRONT}\n\n:::9\n`).out).toEqual(['6 bad-directive'])
  })

  test('takes an indented ::: for prose', () => {
    expect(parse(`${FRONT}\n\n  :::game\n`).file?.segments.map((s) => s.kind)).toEqual(['prose'])
  })
})

describe('loadYaml', () => {
  test('puts an error on the line of the text it is in the file: js-yaml reports the end of an unclosed flow collection on the line after the last', () => {
    const out: Diagnostic[] = []
    expect(loadYaml('a: 1\nb: [2', 'x.md', 30, 'content', out).ok).toBe(false)
    expect(out.map((d) => `${d.file}:${d.line} ${d.code}`)).toEqual(['x.md:32 bad-yaml'])
    expect(formatDiagnostic(out[0])).toMatch(/^x\.md:32: error bad-yaml: not valid YAML: /)
  })

  test('still reports a syntax error once the React Compiler lint rules have replaced Error.prepareStackTrace', async () => {
    // Linting a .tsx file loads eslint-plugin-react-hooks' compiler rules, which install Babel's stack trace rewriter. Bun then
    // refuses Error.captureStackTrace on the plain objects that js-yaml throws, and `bun test` runs the lint tests and this in one
    // process. loadYaml sets the hook aside for the call. Babel installs its rewriter once a process, and a test file that lints puts
    // back the hook it found (tests/lint/stack-hook.ts), so this test puts the rewriter in place itself and takes it out after.
    const root = path.resolve(import.meta.dirname, '../..')
    const hold = holdStackHook()
    try {
      await new ESLint({ cwd: root }).lintText('export const f = () => <p />', { filePath: path.join(root, 'src/x.tsx') })
      const rewriter = hold.rewriter()
      expect(typeof rewriter, "Babel's rewriter, which linting a .tsx installs once a process").toBe('function')
      setStackHook(rewriter)
      const out: Diagnostic[] = []
      expect(loadYaml('a: [1', 'x.md', 1, 'content', out).ok).toBe(false)
      expect(out.map((d) => d.code)).toEqual(['bad-yaml'])
    } finally {
      hold.release()
    }
  })

  test('returns the value', () => {
    expect(loadYaml('a: [1, 2]\nb: { c: d }', 'x', 1, 'content', [])).toEqual({ ok: true, value: { a: [1, 2], b: { c: 'd' } } })
    expect(loadYaml('', 'x', 1, 'content', [])).toEqual({ ok: true, value: undefined })
  })
})

describe('locate: the line of a path in a YAML text', () => {
  const yaml = [
    '# a comment with kcs: in it',
    'id: tr2.l0.p1',
    'prompt: Why?',
    'answer: { kind: numeric, unit: us, rel_tol: 0.15 }',
    'options:',
    '  - id: a',
    '    text: first',
    '',
    '  # between the items',
    '  - id: b',
    '    text: second',
    'kcs:',
    '- one',
    '- two',
    'flow: [x, y]',
    '"quoted": 1',
    "'single': 2",
    'last: 3',
  ]
  const at = (...path: (string | number)[]) => locate(yaml, path) + 1

  test('finds a key at the start of a line', () => {
    expect(at('id')).toBe(2)
    expect(at('prompt')).toBe(3)
    expect(at('last')).toBe(18)
  })

  test('finds a key inside a flow mapping on the line of its parent', () => {
    expect(at('answer')).toBe(4)
    expect(at('answer', 'rel_tol')).toBe(4)
  })

  test('finds a quoted key', () => {
    expect(at('quoted')).toBe(16)
    expect(at('single')).toBe(17)
  })

  test('picks the item of a block sequence, past blank lines and comments', () => {
    expect(at('options', 0)).toBe(6)
    expect(at('options', 1)).toBe(10)
    expect(at('options', 1, 'text')).toBe(11)
    expect(at('options', 0, 'text')).toBe(7)
    expect(at('kcs', 1)).toBe(14)
  })

  test('keeps an index into a flow sequence on the line of its key', () => {
    expect(at('flow', 1)).toBe(15)
  })

  test('falls back to the nearest line it did find', () => {
    expect(at('missing')).toBe(1)
    expect(at('answer', 'missing')).toBe(4)
    expect(at('options', 5)).toBe(5)
    expect(at('options', 1, 'missing')).toBe(10)
  })

  test('does not take the words of a value or a comment for a key', () => {
    expect(at('kcs')).toBe(12)
  })

  test('does not look for a missing key past the item or the value it is inside', () => {
    const list = ['- id: a', '  v: 1', '  source:', '    url: u', '- id: b', '  w: 2', '  source:', '    quote: q']
    // Item 0 has no w, and item 1 does: the line of item 0, not of item 1's w.
    expect(locate(list, [0, 'w']) + 1).toBe(1)
    expect(locate(list, [1, 'w']) + 1).toBe(6)
    // Source 0 has no quote, and source 1 does.
    expect(locate(list, [0, 'source', 'quote']) + 1).toBe(3)
    expect(locate(list, [1, 'source', 'quote']) + 1).toBe(8)
    expect(locate(list, [0, 'source', 'url']) + 1).toBe(4)
  })

  test('takes a block sequence at the indent of its key as that key\'s value', () => {
    const lines = ['kcs:', '- one', '- two', 'other:', '- x', 'last: 1']
    expect(locate(lines, ['kcs', 1]) + 1).toBe(3)
    expect(locate(lines, ['other', 0]) + 1).toBe(5)
    expect(locate(lines, ['kcs', 'missing']) + 1).toBe(1)
  })

  test('follows a flow mapping that runs over lines', () => {
    const lines = ['answer: { kind: numeric,', '  unit: us }', 'next: 1']
    expect(locate(lines, ['answer', 'unit']) + 1).toBe(2)
    expect(locate(lines, ['answer', 'next']) + 1).toBe(1)
  })

  test('picks an item of a top-level sequence of mappings with comments between', () => {
    const list = ['# header', '- id: a', '  v: 1', '', '# next', '- id: b', '  v: 2', '', '- id: c']
    expect([0, 1, 2].map((i) => locate(list, [i]) + 1)).toEqual([2, 6, 9])
    expect(locate(list, [1, 'v']) + 1).toBe(7)
  })
})

describe('schemaDiagnostics', () => {
  const where = { file: 'x.md', firstLine: 10, gate: 'content' as const, subject: ':::game', allowedKeys: ['id', 'level', 'mode'] }

  function issuesOf(yaml: string) {
    const loaded = loadYaml(yaml, 'x.md', 10, 'content', [])
    if (!loaded.ok) throw new Error('bad yaml')
    const parsed = blockBodySchemas.game.safeParse(loaded.value)
    if (parsed.success) return []
    return schemaDiagnostics(parsed.error.issues, { ...where, text: yaml })
  }

  test('puts an unknown key on its own line, and lists the keys', () => {
    expect(issuesOf('id: loop\nlevel: async\nmode: practice\nspeed: 3\nsize: big')).toMatchObject([
      { line: 13, code: 'unknown-key', message: 'unknown key "speed" of :::game (:::game takes id, level, mode)' },
      { line: 14, code: 'unknown-key' },
    ])
  })

  test('puts a bad value on the line of its key', () => {
    const [issue] = issuesOf('id: loop\nlevel: async\nmode: timed')
    expect(issue).toMatchObject({ line: 12, code: 'schema' })
    expect(issue.message).toMatch(/^mode: /)
  })

  test('puts a missing key on the line of its parent: the first line of the text', () => {
    expect(issuesOf('id: loop\nmode: practice').map((d) => `${d.line} ${d.message.split(':')[0]}`)).toEqual(['10 level'])
  })

  test('names an unknown key inside a nested object by its path', () => {
    const schema = z.strictObject({ answer: z.strictObject({ kind: z.string() }) })
    const parsed = schema.safeParse({ answer: { kind: 'x', extra: 1 } })
    if (parsed.success) throw new Error('should fail')
    const [issue] = schemaDiagnostics(parsed.error.issues, { ...where, subject: 'a thing', allowedKeys: undefined, text: 'answer: { kind: x,\n  extra: 1 }' })
    expect(issue).toMatchObject({ line: 11, message: 'unknown key "extra" in answer of a thing' })
  })

  test('adds a hint for a key the compiler writes', () => {
    const parsed = z.strictObject({ id: z.string() }).safeParse({ id: 'x', rev: 'y' })
    if (parsed.success) throw new Error('should fail')
    const [issue] = schemaDiagnostics(parsed.error.issues, { ...where, text: 'id: x\nrev: y', hints: { rev: 'the compiler adds it' } })
    expect(issue.message).toBe('unknown key "rev" of :::game: the compiler adds it')
  })
})
