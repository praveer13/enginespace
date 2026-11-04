/*
 * W0-T08's acceptance checks 1 to 4, on the compiler (ARCHITECTURE §4, D-016).
 *
 *   1. `bun scripts/content/build.ts` writes an index.json of at most 6 KB gz, and every output validates.
 *   2. Each of these fails with file:line: an unknown directive key, a ninth block type, an unknown game, claim or KC id, and an
 *      untagged number in prose.
 *   3. `rev` changes when the token tree changes, and not under a whitespace-only reflow.
 *   4. No compiled prose contains an HTML string.
 *
 * Every test that breaks content breaks a copy of the repo's sample, and says which line it broke.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { claimsOutputSchema, compiledLessonSchema, compiledModuleSchema, contentIndexSchema } from '@es/schema'
import type { ProseFlow, ProseInline } from '@es/schema'
import { BUDGETS, canonicalJson, compileContent, writeOutputs } from '../../scripts/content/build.ts'
import { CLAIM_COUNT, CLAIMS, compile, COURSE, errors, KCS, LESSON, lineOf, MODULE, output, project, read, repo, report, swap, tempDir, where } from './support.ts'
import type { Edit } from './support.ts'

const LESSON_JSON = 'src/content/generated/lessons/tr2.l0-sample.json'
const MODULE_JSON = 'src/content/generated/modules/tr2.json'
const INDEX_JSON = 'src/content/generated/index.json'

const lesson = read(LESSON)
const sample = compile()

describe('the sample content compiles', () => {
  test('without a diagnostic of any kind', () => {
    expect(report(sample)).toBe('')
    expect(sample.stats).toEqual({ modules: 1, lessons: 1, claims: CLAIM_COUNT })
  })

  test('to the outputs of A§4.6', () => {
    expect(sample.outputs.map((o) => o.path).sort()).toEqual([
      'public/claims.json',
      'public/llms.txt',
      'public/md/tr2/index.md',
      'public/md/tr2/l0-sample.md',
      'src/content/generated/index.json',
      'src/content/generated/lessons/tr2.l0-sample.json',
      'src/content/generated/modules/tr2.json',
    ])
  })

  test('twice to the same bytes', () => {
    expect(compile().outputs).toEqual(sample.outputs)
  })

  test('and the sample lesson uses all eight block types', () => {
    const blocks = (JSON.parse(output(sample, LESSON_JSON)) as { blocks: { type: string }[] }).blocks
    expect([...new Set(blocks.map((b) => b.type))].sort()).toEqual(['card', 'figure', 'game', 'item', 'lab', 'predict', 'prose', 'trace'])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 1. The outputs                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const gz = (text: string) => gzipSync(Buffer.from(text), { level: 9 }).length

describe('check 1: the CLI writes index.json within 6 KB gz, and every output validates', () => {
  function run(root: string, ...args: string[]) {
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/content/build.ts'), '--root', root, ...args], { encoding: 'utf8' })
    return { status: result.status, out: result.stdout, err: result.stderr }
  }

  const root = project()
  const first = run(root)

  test('it exits 0 and says what it wrote', () => {
    expect(first.err).toBe('')
    expect(first.status).toBe(0)
    expect(first.out).toBe(`content: 1 module, 1 lesson, ${CLAIM_COUNT} claims: wrote 7 files, 0 unchanged, removed 0\n`)
  })

  test('index.json is at most 6 KB gz [estimated]', () => {
    const size = gz(read(INDEX_JSON, root))
    expect(size).toBeLessThanOrEqual(6 * 1024)
    expect(BUDGETS.index).toBe(6 * 1024)
  })

  test('the index, the module, the lesson and the claims file each validate', () => {
    expect(contentIndexSchema.parse(JSON.parse(read(INDEX_JSON, root))).modules.map((m) => m.id)).toEqual([
      'tr0', 'tr1', 'tr2', 'tr3', 'tr4', 'tr5a', 'tr5b', 'tr6', 'tr7', 'tr8', 'capstone',
    ])
    expect(compiledModuleSchema.parse(JSON.parse(read(MODULE_JSON, root))).id).toBe('tr2')
    expect(compiledLessonSchema.parse(JSON.parse(read(LESSON_JSON, root))).id).toBe('tr2.l0')
    expect(claimsOutputSchema.parse(JSON.parse(read('public/claims.json', root))).claims).toHaveLength(CLAIM_COUNT)
  })

  test('every JSON output is compact and ends in one newline', () => {
    for (const file of [INDEX_JSON, MODULE_JSON, LESSON_JSON, 'public/claims.json']) {
      const text = read(file, root)
      expect(text.endsWith('\n') && !text.endsWith('\n\n')).toBe(true)
      expect(text).toBe(`${JSON.stringify(JSON.parse(text))}\n`)
    }
  })

  test('a second run changes nothing', () => {
    const second = run(root)
    expect(second.out).toBe(`content: 1 module, 1 lesson, ${CLAIM_COUNT} claims: wrote 0 files, 7 unchanged, removed 0\n`)
  })

  test('it removes what it no longer writes, and only inside the folders it owns', () => {
    const stale = ['src/content/generated/lessons/tr2.l9-gone.json', 'public/md/tr2/l9-gone.md', 'public/md/tr9/index.md']
    for (const file of stale) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      writeFileSync(path.join(root, file), 'old')
    }
    writeFileSync(path.join(root, 'public/mine.txt'), 'not the compiler\'s')
    const third = run(root)
    expect(third.out).toContain('removed 3')
    for (const file of stale) expect(existsSync(path.join(root, file))).toBe(false)
    expect(existsSync(path.join(root, 'public/md/tr9'))).toBe(false)
    expect(existsSync(path.join(root, 'public/mine.txt'))).toBe(true)
  })

  test('with an error it exits 1, names the file and the line, and writes nothing', () => {
    const broken = project({ [LESSON]: swap('mode: practice', 'mode: practice\nspeed: 3') })
    const result = run(broken)
    expect(result.status).toBe(1)
    expect(result.out).toContain(`${LESSON}:`)
    expect(result.out).toContain('content: 1 error, nothing written')
    expect(existsSync(path.join(broken, 'src'))).toBe(false)
    expect(existsSync(path.join(broken, 'public/llms.txt'))).toBe(false)
  })

  test('an unknown option is a usage error', () => {
    const result = run(root, '--nope')
    expect(result.status).toBe(2)
    expect(result.err).toContain('usage: bun scripts/content/build.ts')
  })

  test('writeOutputs leaves a file whose bytes are right alone', () => {
    const dir = tempDir('write')
    const outputs = [{ path: 'src/content/generated/index.json', text: '{}\n' }]
    expect(writeOutputs(dir, outputs)).toEqual({ written: ['src/content/generated/index.json'], unchanged: [], removed: [] })
    const mtime = statSync(path.join(dir, outputs[0].path)).mtimeMs
    expect(writeOutputs(dir, outputs)).toEqual({ written: [], unchanged: ['src/content/generated/index.json'], removed: [] })
    expect(statSync(path.join(dir, outputs[0].path)).mtimeMs).toBe(mtime)
  })
})

describe('the budgets', () => {
  test('a lesson over 40 KB gz fails, naming its source file', () => {
    // Random words of letters do not compress much, so a few thousand of them pass the cap, and they hold no number to tag.
    let state = 1
    const random = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const next = (limit: number) => Math.floor(random() * limit)
    const word = () => Array.from({ length: 4 + next(6) }, () => String.fromCharCode(97 + next(26))).join('')
    const filler = Array.from({ length: 12000 }, word).join(' ')
    const result = compile({ [LESSON]: (text) => `${text}\n${filler}\n` })
    expect(where(result)).toEqual([`${LESSON}:1 size-budget`])
    expect(errors(result)[0].message).toContain('over its budget of 40960 [estimated]')
    expect(BUDGETS.page).toBe(40 * 1024)
  })

  test('a lesson that says its minutes wrongly earns a warning and nothing worse', () => {
    const result = compile({ [LESSON]: swap('minutes: 45', 'minutes: 90') })
    expect(errors(result)).toEqual([])
    const warning = result.diagnostics.find((d) => d.code === 'minutes-drift')
    expect(warning).toMatchObject({ severity: 'warning', file: LESSON, line: lineOf(lesson, 'minutes: 45') })
    expect(result.outputs.length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 2. file:line                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A break to make in the lesson, the text of the line it should be reported on, and the code of the report. */
interface Break {
  name: string
  edit: (text: string) => string
  /** A string on the broken line, in the edited text. */
  on: string
  code: string
  gate?: 'content' | 'numbers'
  message: RegExp
}

const breaks: Break[] = [
  {
    name: 'an unknown key in a directive',
    edit: swap('mode: practice', 'mode: practice\nspeed: 3'),
    on: 'speed: 3',
    code: 'unknown-key',
    message: /unknown key "speed" of :::game \(:::game takes id, level, mode\)/,
  },
  {
    name: 'an unknown key inside a flow mapping of a directive',
    edit: swap('rel_tol: 0.15 }', 'rel_tol: 0.15, slack: 2 }'),
    on: 'slack: 2',
    code: 'unknown-key',
    message: /unknown key "slack" in answer of :::predict/,
  },
  {
    name: 'an unknown key in the front matter',
    edit: swap('status: draft ', 'reviewer: someone\nstatus: draft '),
    on: 'reviewer: someone',
    code: 'unknown-key',
    message: /unknown key "reviewer" of a lesson/,
  },
  {
    name: 'a rev that an author wrote',
    edit: swap('status: draft ', 'rev: abc\nstatus: draft '),
    on: 'rev: abc',
    code: 'unknown-key',
    message: /the compiler adds rev/,
  },
  {
    name: 'a ninth block type',
    edit: swap(':::trace\nid: loop-async-off', ':::poll\nquestion: Does it help?\n:::\n\n:::trace\nid: loop-async-off'),
    on: ':::poll',
    code: 'unknown-block',
    message: /:::poll is not a block type \(the cap is eight: prose, predict, item, game, trace, lab, card, figure\. A ninth reopens D-016\)/,
  },
  {
    name: 'a prose directive',
    edit: swap(':::trace\nid: loop-async-off', ':::prose\nWords.\n:::\n\n:::trace\nid: loop-async-off'),
    on: ':::prose',
    code: 'unknown-block',
    message: /prose is the Markdown between directives/,
  },
  {
    name: 'an unknown game',
    edit: swap('id: loop\nlevel: async', 'id: loopy\nlevel: async'),
    on: 'id: loopy',
    code: 'unknown-game',
    message: /no game "loopy": ARCHITECTURE §6\.1 has loop, engine-floor/,
  },
  {
    name: 'an unknown lab',
    edit: swap('id: tr3.profile\nlane: F', 'id: tr3.profil\nlane: F'),
    on: 'id: tr3.profil',
    code: 'unknown-lab',
    message: /no lab "tr3\.profil": ARCHITECTURE §9\.2 has /,
  },
  {
    name: 'an unknown claim in prose',
    edit: swap('{{claim:sample.world.host-step-us}}', '{{claim:sample.world.nope}}'),
    on: '{{claim:sample.world.nope}}',
    code: 'unknown-claim',
    message: /no claim "sample\.world\.nope" in content\/claims/,
  },
  {
    name: 'an unknown KC in the front matter',
    edit: swap('kcs: [tr2.async-overlap, tr2.bubble]', 'kcs: [tr2.async-overlap, tr2.bubble, tr2.nope]'),
    on: 'kcs: [tr2.async-overlap, tr2.bubble, tr2.nope]',
    code: 'unknown-kc',
    message: /no KC "tr2\.nope" in content\/kc\/graph\.yaml/,
  },
  {
    name: 'an unknown KC in a prediction',
    edit: swap('kcs: [tr2.async-overlap]\n:::', 'kcs: [tr2.async-overlap, tr2.nope]\n:::'),
    on: 'kcs: [tr2.async-overlap, tr2.nope]',
    code: 'unknown-kc',
    message: /no KC "tr2\.nope"/,
  },
  {
    name: 'an untagged number in prose',
    edit: swap('A lesson may also carry', 'A lesson may take 12 minutes to read. A lesson may also carry'),
    on: 'A lesson may take 12 minutes',
    code: 'untagged-number',
    gate: 'numbers',
    message: /untagged number "12" in "A lesson may take 12 minutes to read\."/,
  },
  {
    name: 'an untagged number in a prediction',
    edit: swap('prompt: With async scheduling on, how many µs', 'prompt: With 3 requests and async scheduling on, how many µs'),
    on: 'prompt: With 3 requests',
    code: 'untagged-number',
    gate: 'numbers',
    message: /untagged number "3"/,
  },
  {
    name: 'an untagged number in a title',
    edit: swap('title: A sample lesson that uses every block', 'title: A sample lesson of 8 blocks'),
    on: 'title: A sample lesson of 8 blocks',
    code: 'untagged-number',
    gate: 'numbers',
    message: /untagged number "8"/,
  },
]

describe('check 2: each of these fails with file:line', () => {
  for (const found of breaks) {
    test(found.name, () => {
      const edited = found.edit(lesson)
      const result = compile({ [LESSON]: found.edit })
      const line = lineOf(edited, found.on)
      const hit = errors(result).find((d) => d.code === found.code && d.line === line)
      expect(hit, report(result)).toBeDefined()
      expect(hit?.file).toBe(LESSON)
      expect(hit?.gate).toBe(found.gate ?? 'content')
      expect(hit?.message).toMatch(found.message)
      // Nothing is written from a tree with an error.
      expect(result.outputs).toEqual([])
    })
  }

  test('a number is reported on its own line of a wrapped paragraph', () => {
    const wrapped = swap("The tag is the lesson's promise not to lean on it.", "The tag is the lesson's promise\nnot to lean on it, and the\nlesson took 9 weeks to write.")
    const result = compile({ [LESSON]: wrapped })
    expect(where(result)).toEqual([`${LESSON}:${lineOf(wrapped(lesson), 'lesson took 9 weeks to write.')} untagged-number`])
  })

  test('a reference is reported on its own line of a wrapped paragraph', () => {
    const wrapped = swap('In the sample world a host step takes {{claim:sample.world.host-step-us}} and', 'In the sample world a host step\ntakes\n{{claim:sample.world.nope}} and')
    const result = compile({ [LESSON]: wrapped })
    expect(where(result)).toEqual([`${LESSON}:${lineOf(wrapped(lesson), '{{claim:sample.world.nope}}')} unknown-claim`])
  })

  test('a number in a list item and in a heading is reported on its line', () => {
    const edit = (text: string) => text.replace('- how much of the host step', '- how much of the 40 host step').replace('## The bubble', '## The 5 bubble')
    const edited = edit(lesson)
    const result = compile({ [LESSON]: edit })
    expect(where(result, 'numbers')).toEqual([`${LESSON}:${lineOf(edited, '## The 5 bubble')} untagged-number`, `${LESSON}:${lineOf(edited, '- how much of the 40 host step')} untagged-number`])
  })

  test('a header tag tags its column, and no other', () => {
    const table = '| Configuration | Bubble, µs [estimated] |\n|---|---|\n| Async scheduling off | 300 |\n| Async scheduling on | 0 |'
    const wider = '| Configuration | Bubble, µs [estimated] | Note |\n|---|---|---|\n| Async scheduling off | 300 | 7 days |\n| Async scheduling on | 0 | none |'
    const edited = lesson.replace(table, wider)
    expect(where(compile({ [LESSON]: swap(table, wider) }), 'numbers')).toEqual([`${LESSON}:${lineOf(edited, '| Async scheduling off | 300 | 7 days |')} untagged-number`])
    // Without the tag in the header, every number cell of the table is on its own.
    const bare = lesson.replace(table, table.replace(' [estimated]', ''))
    expect(where(compile({ [LESSON]: swap(table, table.replace(' [estimated]', '')) }), 'numbers')).toEqual([
      `${LESSON}:${lineOf(bare, '| Async scheduling off | 300 |')} untagged-number`,
      `${LESSON}:${lineOf(bare, '| Async scheduling on | 0 |')} untagged-number`,
    ])
  })

  test('the gates name the same lines', () => {
    const broken = project({ [LESSON]: breaks[0].edit })
    const line = lineOf(breaks[0].edit(lesson), 'speed: 3')
    const run = (gate: string) => spawnSync(process.execPath, [path.join(repo, `scripts/verify-${gate}.ts`), '--root', broken], { encoding: 'utf8' })
    const content = run('content')
    expect(content.status).toBe(1)
    expect(content.stdout).toContain(`${LESSON}:${line}: error unknown-key:`)
    // A gate reports its own problems and passes on the others.
    expect(run('numbers').status).toBe(0)
    expect(run('claims').status).toBe(0)
  })
})

describe('ids, refs and links', () => {
  /** course.yaml without TR7, so that a module of that name is one the course does not have. */
  const withoutTr7 = swap('  - id: tr7\n    title: Contribute honestly\n    hours: 6 # [estimated]\n    hours_by_lane: { B: 2, F: 4 } # [estimated]\n', '')
  const cases: [string, Record<string, Edit>, string[]][] = [
    ['a lesson id that does not match its file', { [LESSON]: swap('id: tr2.l0\n', 'id: tr2.l3\n') }, [`${LESSON}:2 id-mismatch`]],
    ['a lesson whose id and module disagree', { [LESSON]: swap('module: tr2', 'module: tr1') }, [`${LESSON}:2 schema`]],
    ['a lesson in the wrong module folder', { [LESSON]: swap('id: tr2.l0\nmodule: tr2', 'id: tr1.l0\nmodule: tr1') }, [`${LESSON}:2 id-mismatch`, `${LESSON}:3 id-mismatch`]],
    ['a prediction that belongs to another lesson', { [LESSON]: swap('id: tr2.l0.p1', 'id: tr2.l3.p1') }, [`${LESSON}:${lineOf(lesson, 'id: tr2.l0.p1')} id-mismatch`]],
    ['a prediction with a malformed id', { [LESSON]: swap('id: tr2.l0.p1', 'id: p1') }, [`${LESSON}:${lineOf(lesson, 'id: tr2.l0.p1')} schema`]],
    ['a file name that is not a lesson number', { 'content/modules/tr2/lessons/intro.md': lesson }, ['content/modules/tr2/lessons/intro.md:1 bad-file-name']],
    ['two files for one lesson number', { 'content/modules/tr2/lessons/l0-other.md': lesson }, [`${LESSON}:1 duplicate-id`]],
    [
      'a module that course.yaml does not have',
      { [COURSE]: withoutTr7, 'content/modules/tr7/module.md': read(MODULE).replace('id: tr2', 'id: tr7') },
      ['content/modules/tr7:1 unknown-module'],
    ],
    ['a module folder with no module.md', { [MODULE]: null }, ['content/modules/tr2:1 missing-file']],
    ['a module whose title differs from course.yaml', { [MODULE]: swap('title: The step loop', 'title: The loop of steps') }, [`${MODULE}:3 title-mismatch`]],
    [
      'a module whose hours differ from course.yaml',
      { [MODULE]: (text) => text.replace('hours: 10 ', 'hours: 12 ').replace('hours_by_lane: { B: 10 }', 'hours_by_lane: { B: 12 }') },
      [`${MODULE}:${lineOf(read(MODULE), 'hours: 10')} hours-mismatch`, `${MODULE}:${lineOf(read(MODULE), 'hours_by_lane')} hours-mismatch`],
    ],
    ['a module whose lanes differ from course.yaml', { [MODULE]: swap('lanes: [B]', 'lanes: [B, F]') }, [`${MODULE}:${lineOf(read(MODULE), 'lanes: [B]')} lanes-mismatch`]],
    ['a module that needs a card that does not exist', { [MODULE]: swap('worlds: [trace-room-steploop]', 'worlds: [no-such-world]') }, [`${MODULE}:${lineOf(read(MODULE), 'worlds: [trace-room-steploop]')} unknown-card`]],
    ['a module that depends on a module that does not exist', { [COURSE]: withoutTr7, [MODULE]: swap('prereqs: [', 'prereqs: [tr7, ') }, [`${MODULE}:${lineOf(read(MODULE), 'prereqs: [')} unknown-module`]],
    ['a module that names a game that does not exist', { [MODULE]: swap('games: [loop]', 'games: [loop, nope]') }, [`${MODULE}:${lineOf(read(MODULE), 'games: [loop]')} unknown-game`]],
    ['a figure whose file is missing', { [LESSON]: swap('src: figures/tr2/l0-sample.svg', 'src: figures/tr2/missing.svg') }, [`${LESSON}:${lineOf(lesson, 'src: figures/tr2/l0-sample.svg')} missing-file`]],
    [
      'a card that lives in a file and has none',
      { [LESSON]: swap('kind: warning\ntitle: A model\nbody: The browser world is a model, and the real engine is the judge.', 'kind: notional-machine\nid: no-such-card') },
      [`${LESSON}:${lineOf(lesson.replace('kind: warning\ntitle: A model\nbody: The browser world is a model, and the real engine is the judge.', 'kind: notional-machine\nid: no-such-card'), 'id: no-such-card')} unknown-card`],
    ],
    ['a prediction that tests a KC the lesson does not list', { [LESSON]: swap('kcs: [tr2.async-overlap, tr2.bubble]', 'kcs: [tr2.bubble]') }, [`${LESSON}:${lineOf(lesson, 'kcs: [tr2.async-overlap, tr2.bubble]')} kc-mismatch`]],
    ['games that list a game no block uses', { [LESSON]: swap('games: [loop]', 'games: [loop, pool]') }, [`${LESSON}:${lineOf(lesson, 'games: [loop]')} games-mismatch`]],
    ['a block that uses a lab the lesson does not list', { [LESSON]: swap('labs: [tr3.profile]', 'labs: [hybrid-kv]') }, [`${LESSON}:${lineOf(lesson, 'labs: [tr3.profile]')} labs-mismatch`, `${LESSON}:${lineOf(lesson, 'labs: [tr3.profile]')} labs-mismatch`]],
    ['a module in the lock that is missing, once the lock exists', { 'course.lock.json': JSON.stringify({ schema: 'enginespace/lock@1', entries: [{ key: 'sglang' }] }) }, [`${MODULE}:${lineOf(read(MODULE), 'pins: [vllm, sglang]')} unknown-pin`]],
  ]
  for (const [name, edits, expected] of cases) {
    test(name, () => {
      const result = compile(edits)
      expect(where(result)).toEqual(expected)
    })
  }

  test('a lock that has the pins lets the module pass', () => {
    const lock = JSON.stringify({ schema: 'enginespace/lock@1', entries: [{ key: 'vllm' }, { key: 'sglang' }] })
    expect(where(compile({ 'course.lock.json': lock }))).toEqual([])
  })

  test('a card in a file of its own passes once the file exists', () => {
    const edit = swap('kind: warning\ntitle: A model\nbody: The browser world is a model, and the real engine is the judge.', 'kind: notional-machine\nid: no-such-card')
    expect(where(compile({ [LESSON]: edit }))).toEqual([`${LESSON}:${lineOf(edit(lesson), 'id: no-such-card')} unknown-card`])
    expect(where(compile({ [LESSON]: edit, 'content/cards/no-such-card.md': '---\nid: no-such-card\n---\n' }))).toEqual([])
  })

  test('a mended directive stops its lesson from failing the comparison with its blocks', () => {
    // One broken block must not also read as "games lists loop, which no block uses".
    const result = compile({ [LESSON]: swap('mode: practice', 'mode: practice\nspeed: 3') })
    expect(where(result)).toEqual([`${LESSON}:${lineOf(lesson.replace('mode: practice', 'mode: practice\nspeed: 3'), 'speed: 3')} unknown-key`])
  })

  test('no course.yaml is one error, and the modules still get their own', () => {
    const result = compile({ [COURSE]: null, [LESSON]: swap('mode: practice', 'mode: practice\nspeed: 3') })
    expect(where(result)).toContain('content/course.yaml:1 missing-file')
    expect(where(result)).toContain(`${LESSON}:${lineOf(lesson.replace('mode: practice', 'mode: practice\nspeed: 3'), 'speed: 3')} unknown-key`)
  })

  test('a course.yaml whose lanes do not add up to its hours', () => {
    const result = compile({ [COURSE]: swap('hours_by_lane: { B: 10 }', 'hours_by_lane: { B: 9 }') })
    expect(where(result)).toEqual([`${COURSE}:${lineOf(read(COURSE), 'hours_by_lane: { B: 10 }')} schema`])
  })

  test('a KC graph that does not validate is reported where it breaks', () => {
    const result = compile({ [KCS]: swap('requires: [tr2.bubble]', 'requires: [tr2.nowhere]') })
    expect(where(result)).toEqual([`${KCS}:${lineOf(read(KCS), 'requires: [tr2.bubble]')} schema`])
  })

  test('a duplicate claim names both places', () => {
    const result = compile({ 'content/claims/more.yaml': read(CLAIMS) })
    const ids = ['vllm.release.requires-python', 'sample.world.host-step-us', 'sample.world.decode-step-us', 'sample.world.decode-step-ms']
    // more.yaml is read first, so it holds the originals and sample.yaml the repeats.
    expect(where(result, 'claims')).toEqual(ids.map((id) => `${CLAIMS}:${lineOf(read(CLAIMS), `- id: ${id}`)} duplicate-claim`))
    expect(errors(result, 'claims')[0].message).toBe(`claim "${ids[0]}" is also defined at content/claims/more.yaml:${lineOf(read(CLAIMS), `- id: ${ids[0]}`)}`)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 3. rev                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const revOf = (edits: Record<string, Edit>, file = LESSON_JSON) => (JSON.parse(output(compile(edits), file)) as { rev: string }).rev
const baseRev = revOf({})

describe('check 3: rev changes when the token tree changes, and not under a whitespace-only reflow', () => {
  test('it is a SHA-256', () => {
    expect(baseRev).toMatch(/^[0-9a-f]{64}$/)
  })

  const changes: [string, Record<string, Edit>][] = [
    ['a word of prose', { [LESSON]: swap('the GPU can sit idle', 'the GPU can wait') }],
    ['a tag', { [LESSON]: swap('a 2.1 ms decode step [estimated]', 'a 2.1 ms decode step [unverified]') }],
    ['emphasis', { [LESSON]: swap('the *bubble*', 'the **bubble**') }],
    ['a heading level', { [LESSON]: swap('### What async scheduling changes', '## What async scheduling changes') }],
    ['a list item', { [LESSON]: swap('- whether a captured CUDA graph', '- whether a captured graph') }],
    ['a table cell', { [LESSON]: swap('| Async scheduling on | 0 |', '| Async scheduling on | 1 |') }],
    ['a code block', { [LESSON]: swap('schedule -> launch -> sample -> update', 'schedule -> launch -> update') }],
    ['a link', { [LESSON]: swap('[the course map](/map)', '[the course map](/about)') }],
    ['a block of the lesson', { [LESSON]: swap('rel_tol: 0.15', 'rel_tol: 0.2') }],
    ['a block that is added', { [LESSON]: swap('\n:::item', '\n:::item\nfamily: tr2.graph-hit\nlevel: 1\ncount: 1\n:::\n\n:::item') }],
    ['the title', { [LESSON]: swap('title: A sample lesson that uses every block', 'title: A sample lesson that uses all blocks') }],
    ['the knowledge components', { [LESSON]: swap('kcs: [tr2.async-overlap, tr2.bubble]', 'kcs: [tr2.bubble, tr2.async-overlap]') }],
    ['a claim the lesson cites: its value', { [CLAIMS]: swap('value: 300', 'value: 310') }],
    ['a claim the lesson cites: its words', { [CLAIMS]: swap('takes 300 microseconds', 'takes about 300 microseconds') }],
  ]
  for (const [what, edits] of changes) {
    test(`changes with ${what}`, () => {
      const rev = revOf(edits)
      expect(rev).toMatch(/^[0-9a-f]{64}$/)
      expect(rev).not.toBe(baseRev)
    })
  }

  const same: [string, Record<string, Edit>][] = [
    ['a paragraph rewrapped, with spaces doubled and at line ends', { [LESSON]: swap('This lesson is a sample. It gives the content compiler, the renderer and', 'This lesson   is a sample. \nIt gives the content\ncompiler,   the renderer\nand') }],
    ['blank lines added between blocks', { [LESSON]: (text) => text.replace(/\n\n/g, '\n\n\n\n') }],
    ['Windows line endings', { [LESSON]: (text) => text.replace(/\n/g, '\r\n') }],
    ['a list item and a table cell rewrapped', { [LESSON]: swap('- whether the next step\'s inputs depend on a token that is not sampled yet;', '- whether the next step\'s inputs\n  depend on a token that is\n  not sampled yet;') }],
    ['a directive written in block style, with its keys in another order', { [LESSON]: swap('answer: { kind: numeric, unit: us, rel_tol: 0.15 }\nreveal: after-game\nkcs: [tr2.async-overlap]', 'kcs:\n  - tr2.async-overlap\nreveal: after-game\nanswer:\n  rel_tol: 0.15\n  unit: us\n  kind: numeric') }],
    ['front matter keys in another order', { [LESSON]: swap('module: tr2\ntitle: A sample lesson that uses every block', 'title: A sample lesson that uses every block\nmodule: tr2') }],
    ['the status', { [LESSON]: swap('status: draft ', 'status: review') }],
    ['the declared minutes', { [LESSON]: swap('minutes: 45', 'minutes: 46') }],
    ['a comment in the YAML', { [LESSON]: swap('# draft | review | live', '# draft, review or live') }],
    ['a claim the lesson does not cite', { [CLAIMS]: swap('value: 2.1', 'value: 2.2') }],
    ['the day a cited claim was checked', { [CLAIMS]: swap('verifiedAt: 2026-11-04\n  ttlDays: 90', 'verifiedAt: 2026-11-05\n  ttlDays: 90') }],
    ['the TTL of a cited claim', { [CLAIMS]: swap('ttlDays: 90', 'ttlDays: 120') }],
    ['the file name of a lesson', { 'content/modules/tr2/lessons/l0-sample.md': null, 'content/modules/tr2/lessons/l0-renamed.md': lesson }],
  ]
  for (const [what, edits] of same) {
    test(`stays the same under ${what}`, () => {
      const file = what.startsWith('the file name') ? 'src/content/generated/lessons/tr2.l0-renamed.json' : LESSON_JSON
      expect(revOf(edits, file)).toBe(baseRev)
    })
  }

  test('a module has a rev too, and it follows the module\'s own words', () => {
    const moduleRev = revOf({}, MODULE_JSON)
    expect(moduleRev).toMatch(/^[0-9a-f]{64}$/)
    expect(moduleRev).not.toBe(baseRev)
    expect(revOf({ [MODULE]: swap('is the engine\'s heartbeat', 'is the engine\'s pulse') }, MODULE_JSON)).not.toBe(moduleRev)
    expect(revOf({ [MODULE]: swap('is the engine\'s heartbeat.', 'is the engine\'s\nheartbeat.') }, MODULE_JSON)).toBe(moduleRev)
  })

  test('canonicalJson sorts keys at every depth and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: undefined }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"z":1}]},"b":1}')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 4. No HTML in prose                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

type Walked = { path: string; value: string; inCode: boolean }

/** Every string in a compiled value, with the path to it, and whether it is code (which may hold anything). */
function strings(value: unknown, at = '$', inCode = false): Walked[] {
  if (typeof value === 'string') return [{ path: at, value, inCode }]
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${at}[${i}]`, inCode))
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    const code = inCode || record.type === 'code'
    return Object.entries(record).flatMap(([key, inner]) => strings(inner, `${at}.${key}`, code))
  }
  return []
}

const HTML = /<\/?[A-Za-z][^>]*>|<!--|&(?:[a-z]+|#\d+);/

describe('check 4: no compiled prose contains an HTML string', () => {
  const compiled = JSON.parse(output(sample, LESSON_JSON)) as { blocks: { type: string; body?: unknown }[] }
  const moduleCompiled = JSON.parse(output(sample, MODULE_JSON)) as { blocks: { type: string; body?: unknown }[] }

  test('the scanner finds HTML where there is some', () => {
    expect(strings({ type: 'text', text: 'x <b>y</b>' }).filter((s) => HTML.test(s.value))).toHaveLength(1)
    expect(strings({ type: 'code', text: '<div>' }).every((s) => s.inCode)).toBe(true)
  })

  test('no prose string of the lesson or the module holds a tag, a comment or an entity', () => {
    const prose = [...compiled.blocks, ...moduleCompiled.blocks].filter((b) => b.type === 'prose')
    expect(prose.length).toBeGreaterThan(1)
    const found = prose.flatMap((b) => strings(b.body)).filter((s) => !s.inCode && HTML.test(s.value))
    expect(found).toEqual([])
  })

  test('no string of any output holds HTML outside code', () => {
    const everything = sample.outputs.filter((o) => o.path.endsWith('.json')).flatMap((o) => strings(JSON.parse(o.text)))
    expect(everything.filter((s) => !s.inCode && HTML.test(s.value))).toEqual([])
  })

  const html: [string, string][] = [
    ['an inline tag', 'This is <b>bold</b> text.'],
    ['a generic type outside code', 'A `Vec` is a Vec<T> in Rust.'],
    ['a block of HTML', '<div class="x">\nwords\n</div>'],
    ['a comment', 'Words <!-- hidden --> more words.'],
    ['a script', '<script>alert(1)</script>'],
    ['an iframe', 'See <iframe src="https://example.com"></iframe>.'],
  ]
  for (const [what, md] of html) {
    test(`${what} is an error with its line`, () => {
      const edit = swap('The sample ends here.', `${md}\n\nThe sample ends here.`)
      const result = compile({ [LESSON]: edit })
      const line = lineOf(edit(lesson), md.split('\n')[0])
      expect(where(result)).toEqual([`${LESSON}:${line} html`])
      expect(result.outputs).toEqual([])
    })
  }

  test('HTML in code is text', () => {
    const edit = swap('The sample ends here.', 'Write `<b>` and `Vec<T>` in backticks:\n\n```html\n<div>x</div>\n```\n\nThe sample ends here.')
    const result = compile({ [LESSON]: edit })
    expect(where(result)).toEqual([])
    const text = output(result, LESSON_JSON)
    expect(text).toContain('"text":"<div>x</div>"')
    expect(text).toContain('"text":"Vec<T>"')
  })

  test('a link that goes nowhere allowed is one error, and not also a failure of the output', () => {
    const edit = swap('[the course map](/map)', '[the course map](javascript:alert(1))')
    const result = compile({ [LESSON]: edit })
    expect(where(result)).toEqual([`${LESSON}:${lineOf(edit(lesson), 'the course map')} bad-link`])
  })

  test('an angle bracket and a bare ampersand in a sentence are text', () => {
    const edit = swap('The sample ends here.', 'A value x < y and y > z, in R&D, is plain text.\n\nThe sample ends here.')
    expect(where(compile({ [LESSON]: edit }))).toEqual([])
  })

  test('an entity is HTML, and says to write the character', () => {
    const edit = swap('The sample ends here.', 'Write & kept as &amp; here.\n\nThe sample ends here.')
    const result = compile({ [LESSON]: edit })
    expect(where(result)).toEqual([`${LESSON}:${lineOf(edit(lesson), 'Write & kept')} html`])
    expect(errors(result)[0].message).toContain('the entity &amp; is HTML. Write the character itself')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The compiled tree                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

function flat(nodes: ProseInline[]): string {
  return nodes.map((node) => ('text' in node ? node.text : 'children' in node ? flat(node.children) : `<${node.type}>`)).join('')
}

describe('the compiled tree of the sample', () => {
  const lessonJson = JSON.parse(output(sample, LESSON_JSON)) as { blocks: ({ type: 'prose'; body: ProseFlow[] } | { type: string })[] }
  const first = lessonJson.blocks[0] as { type: 'prose'; body: ProseFlow[] }

  test('the first prose block starts with a paragraph and a level-two heading', () => {
    expect(first.body.slice(0, 2).map((node) => node.type)).toEqual(['paragraph', 'heading'])
    expect(first.body[1]).toMatchObject({ type: 'heading', depth: 2 })
  })

  test('the prose and the directives keep the order of the file', () => {
    expect(lessonJson.blocks.map((b) => b.type)).toEqual(['prose', 'predict', 'game', 'item', 'trace', 'lab', 'card', 'figure', 'prose'])
  })

  test('claims, tags and references are nodes, and the tags are chips and not text', () => {
    const everything = first.body.flatMap((node) => (node.type === 'paragraph' ? node.children : []))
    expect(everything).toContainEqual({ type: 'claim', id: 'sample.world.host-step-us' })
    expect(everything).toContainEqual({ type: 'tag', tag: 'unverified' })
    expect(everything).toContainEqual({ type: 'ks', ref: 'ks:T5.L7' })
    expect(flat(everything)).not.toContain('[estimated]')
  })
})

describe('compileContent on the repo itself', () => {
  test('passes, so CI\'s compile step and the gates pass', () => {
    const result = compileContent({ root: repo })
    expect(report(result)).toBe('')
    expect(result.outputs.length).toBe(7)
  })

})
