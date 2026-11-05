/*
 * W1-T12 acceptance check 4: the dispatcher golden tables (GAMES.md §3, "Invariants the tests check"; DECISIONS Q-10).
 *
 * The check asks for tables that vLLM's own dispatchers wrote, on at least 5,000 cases each, with `dispatchV2` and `dispatchV1` agreeing with
 * them. A table can only come from running the pinned code, and the session that wrote the script was not allowed to run it (the permission
 * system refused code from the downloaded tarball), so the tables are the owner's to make (Q-10) and this file does the two halves that need
 * no vLLM:
 *
 *   - while there are no tables it holds the repository to saying so: `DISPATCH_TABLES.status` is `waiting`, and W1-T13's `keys` level
 *     reads that;
 *   - it holds everything else that the run depends on: the cases the script answers (their number, their spread, their determinism and
 *     their hash), the checker that compares a table with the model (shown to pass on a table made by the dictionary-shaped port in
 *     tests/sim/graphs-oracle.ts and to fail on each way a table can be wrong), the command line, and the script itself (read as text, and
 *     parsed when Python is on the machine).
 *
 * The day the owner commits tests/fixtures/dispatch/v0.33.0.json and its .sha256, three tests here start to run for real: the status must
 * flip to `committed`, the SHA-256 must match, and the model must agree with every row of vLLM's own answers.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { lockFileSchema } from '@es/schema/lock'
import { canonicalJson } from '../../packages/sim/core/json'
import { DISPATCH_TABLES, GRAPH_MODES } from '../../packages/sim/steploop'
import {
  CASES_SCHEMA,
  CASES_SEED,
  MIN_CASES,
  PIN,
  TABLE_DIR,
  TABLE_FILE,
  TABLE_SCHEMA,
  buildCases,
  casesSha256,
  checkTable,
  modelResults,
  readTable,
  renderCases,
  sha256,
  sizesForV1,
  tablesStatus,
} from '../../scripts/tables/dispatch-cases'
import type { DispatchCases, Results, Table } from '../../scripts/tables/dispatch-cases'
import { MODE_NUMBER, OracleDispatcherV1, OracleManagerV2, rowV1, rowV2 } from './graphs-oracle'

const root = path.resolve(import.meta.dirname, '../..')
const cases = buildCases()

/** What the dictionary-shaped port answers for every case, in the table's shape. The sizes and the mode downgrades come from the model, which the port does not cover. */
function standInResults(c: DispatchCases): Results {
  const managers = c.v2.configs.map((x) => new OracleManagerV2({ mode: x.mode, captureSizes: x.sizes, maxNumSeqs: x.maxNumSeqs, decodeQueryLen: x.decodeQueryLen, lora: x.lora }))
  const dispatchers = c.v1.configs.map((x) => new OracleDispatcherV1({ mode: x.mode, captureSizes: sizesForV1(x), maxNumSeqs: x.maxNumSeqs, decodeQueryLen: x.decodeQueryLen, lora: x.lora }))
  const model = modelResults(c)
  return {
    v2: c.v2.cases.map(([cfg, reqs, tokens, uniform, loras, maxQuery]) => rowV2(managers[cfg].dispatch(reqs, tokens, uniform, loras, maxQuery))),
    v1: c.v1.cases.map(([cfg, tokens, uniformDecode, hasLora, loras]) => rowV1(dispatchers[cfg].dispatch(tokens, uniformDecode === 1, hasLora === 1, loras))),
    v1Sizes: model.v1Sizes,
    sizes: model.sizes,
    modes: model.modes,
  }
}

function standInTable(c: DispatchCases = cases): Table {
  const results = standInResults(c)
  return {
    meta: {
      schema: TABLE_SCHEMA,
      pin: PIN,
      casesSha256: casesSha256(c),
      provenance: '[a stand-in made by tests/sim/dispatch-tables.test.ts; not vLLM]',
      generatedAt: '2026-11-04',
      host: { python: 'none' },
      script: { path: 'scripts/tables/vllm-dispatch.py', sha256: '0'.repeat(64) },
      counts: { v2: results.v2.length, v1: results.v1.length, sizes: results.sizes.length, modes: results.modes.length },
    },
    results,
  }
}

const mutate = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('the cases the script answers', () => {
  test('are at least 5,000 for each dispatcher, and the sizes and the downgrades beside them', () => {
    expect(MIN_CASES).toBe(5000)
    expect(cases.schema).toBe(CASES_SCHEMA)
    expect(cases.v2.cases.length).toBeGreaterThanOrEqual(MIN_CASES)
    expect(cases.v1.cases.length).toBeGreaterThanOrEqual(MIN_CASES)
    expect(cases.sizes.length).toBeGreaterThanOrEqual(60)
    expect(cases.modes).toHaveLength(5 * 4 * 2 * 2 * 2)
  })

  test('are drawn the same way every time, and are one canonical JSON text with a newline', () => {
    expect(canonicalJson(buildCases())).toBe(canonicalJson(cases))
    expect(renderCases(cases)).toBe(`${canonicalJson(cases)}\n`)
    expect(casesSha256(cases)).toBe(sha256(canonicalJson(cases)))
    expect(cases.seed).toBe(CASES_SEED)
  })

  test('have the hash below. A table answers cases by this hash, so a change to the draw means the owner\'s run is to be done again: change it here only with a new table', () => {
    expect(casesSha256(cases)).toBe('eb84d8db3a123f51a5a74efabfa8d0a90a2ed810d7248178838e0e85c82965aa')
  })

  test('name the pin of course.lock.json: the tag and the commit that the tables are made at', () => {
    const lock = lockFileSchema.parse(JSON.parse(readFileSync(path.join(root, 'course.lock.json'), 'utf8')))
    const vllm = lock.entries.find((entry) => entry.key === 'vllm')
    expect(vllm?.commit).toBe(PIN.commit)
    expect(`v${vllm?.version}`).toBe(PIN.tag)
    expect(vllm?.version).toBe(PIN.version)
    expect(cases.pin).toEqual(PIN)
  })

  test('cover every mode with every kind of configuration: plain, speculative, with adapters under all four settings of the two switches, and learner lists', () => {
    const configs = cases.v2.configs
    for (const mode of Object.keys(GRAPH_MODES)) expect(configs.some((c) => c.mode === mode)).toBe(true)
    expect(configs.some((c) => c.decodeQueryLen > 1)).toBe(true)
    expect(configs.some((c) => c.lora === null)).toBe(true)
    for (const [specializeLora, specializeActiveLora] of [[true, false], [true, true], [false, false], [false, true]] as const) {
      expect(configs.some((c) => c.lora?.specializeLora === specializeLora && c.lora.specializeActiveLora === specializeActiveLora)).toBe(true)
    }
    // The engine's own lists and learner lists: some config has vLLM's 51 sizes, and some has a short odd list.
    expect(configs.some((c) => c.sizes.length === 51)).toBe(true)
    expect(configs.some((c) => c.sizes.length <= 12 && c.mode !== 'NONE' && c.sizes.some((n) => n % 8 !== 0))).toBe(true)
  })

  test('probe the edges: a token count one below, on and one above a captured size, the largest size and beyond it, and adapter counts up to two above the cap', () => {
    const near = new Set<string>()
    for (const [cfg, , tokens] of cases.v2.cases) {
      const sizes = cases.v2.configs[cfg].sizes
      for (const delta of [-1, 0, 1]) if (sizes.includes(tokens - delta)) near.add(`${delta}`)
    }
    expect([...near].sort()).toEqual(['-1', '0', '1'])
    const beyond = cases.v2.cases.filter(([cfg, , tokens]) => tokens > Math.max(...cases.v2.configs[cfg].sizes))
    expect(beyond.length).toBeGreaterThan(200)
    const over = cases.v2.cases.filter(([cfg, , , , loras]) => cases.v2.configs[cfg].lora !== null && loras > (cases.v2.configs[cfg].lora?.maxLoras ?? 0) + 1)
    expect(over.length).toBeGreaterThan(50)
  })

  test('keep MRV1\'s cases to what its code can answer: no has_lora without a LoRA config (vLLM asserts), and sizes rounded where vLLM rounds them', () => {
    for (const [cfg, , , hasLora, loras] of cases.v1.cases) {
      expect(hasLora === 1).toBe(loras > 0)
      if (cases.v1.configs[cfg].lora === null) expect(loras).toBe(0)
    }
    for (const config of cases.v1.configs) {
      if (GRAPH_MODES[config.mode].decode === 'FULL' && config.decodeQueryLen > 1) {
        for (const size of sizesForV1(config)) expect(size % config.decodeQueryLen).toBe(0)
      }
    }
  })
})

describe('the checker, on a table made by the dictionary-shaped port', () => {
  const table = standInTable()

  test('passes a table whose every row is the model\'s answer, and counts what it checked', () => {
    const verdict = checkTable(cases, table)
    expect(verdict.problems).toEqual([])
    expect(verdict.ok).toBe(true)
    expect(verdict.checked.v2).toBe(cases.v2.cases.length)
    expect(verdict.checked.v1).toBe(cases.v1.cases.length)
    expect(verdict.checked.v1).toBeGreaterThanOrEqual(MIN_CASES)
  })

  test('fails a table with one row of MRV2 changed, and says which case and what each side gave', () => {
    const bad = mutate(table)
    const row = bad.results.v2[1234] as unknown as number[]
    row[0] = row[0] === MODE_NUMBER.FULL ? MODE_NUMBER.NONE : MODE_NUMBER.FULL
    const verdict = checkTable(cases, bad)
    expect(verdict.ok).toBe(false)
    expect(verdict.problems).toHaveLength(1)
    expect(verdict.problems[0]).toContain('v2 case 1234')
    expect(verdict.problems[0]).toContain('vLLM gives')
  })

  test('fails a table with one row of MRV1, of the sizes, of the downgrades or of MRV1\'s adjusted sizes changed', () => {
    const v1 = mutate(table)
    ;(v1.results.v1[77] as unknown as number[])[1] += 1
    expect(checkTable(cases, v1).problems.some((p) => p.startsWith('v1 case 77'))).toBe(true)
    const sizes = mutate(table)
    ;(sizes.results.sizes[3] as unknown as number[]).push(99999)
    expect(checkTable(cases, sizes).problems.some((p) => p.startsWith('sizes case 3'))).toBe(true)
    const modes = mutate(table)
    ;(modes.results.modes as unknown as unknown[])[5] = 'error'
    expect(checkTable(cases, modes).problems.some((p) => p.startsWith('modes case 5'))).toBe(true)
    const adjusted = mutate(table)
    const withSpec = cases.v1.configs.findIndex((c) => GRAPH_MODES[c.mode].decode === 'FULL' && c.decodeQueryLen > 1)
    expect(withSpec).toBeGreaterThanOrEqual(0)
    ;(adjusted.results.v1Sizes[withSpec] as unknown as number[]).pop()
    expect(checkTable(cases, adjusted).problems.some((p) => p.startsWith('v1Sizes config'))).toBe(true)
  })

  test('shows the first few rows that differ and counts the rest', () => {
    const bad = mutate(table)
    for (let i = 0; i < 30; i++) (bad.results.v2[i] as unknown as number[])[1] += 1
    const verdict = checkTable(cases, bad)
    expect(verdict.problems.filter((p) => p.startsWith('v2 case'))).toHaveLength(8)
    expect(verdict.problems).toContain('v2: 22 more rows differ')
  })

  test('fails a table made for other cases, another pin or another schema, or with the wrong number of rows, or with a section that did not finish', () => {
    expect(checkTable(cases, { ...table, meta: { ...table.meta, casesSha256: '0'.repeat(64) } }).problems[0]).toContain('other cases')
    expect(checkTable(cases, { ...table, meta: { ...table.meta, pin: { ...PIN, commit: 'f'.repeat(40) } } }).problems[0]).toContain('is for')
    expect(checkTable(cases, { ...table, meta: { ...table.meta, schema: 'other' as never } }).problems[0]).toContain('schema')
    expect(checkTable(cases, { ...table, results: { ...table.results, v2: table.results.v2.slice(1) } }).problems.join('\n')).toContain(`v2 has ${cases.v2.cases.length - 1} rows for ${cases.v2.cases.length} cases`)
    expect(checkTable(cases, { ...table, meta: { ...table.meta, failed: ['modes: ValueError: boom'] } }).problems.join('\n')).toContain('did not finish a section: modes: ValueError: boom')
    expect(checkTable(cases, { ...table, meta: { ...table.meta, tarball: { commit: 'f'.repeat(40), sha256: '0'.repeat(64) } } }).problems.join('\n')).toContain('the tarball was made at commit')
  })

  test('the sizes and the downgrades of the model are checked against rows the script would write, in the same shapes', () => {
    const model = modelResults(cases)
    expect(model.sizes).toHaveLength(cases.sizes.length)
    expect(model.modes.filter((m) => m === 'error').length).toBeGreaterThan(0)
    expect(model.modes.filter((m) => m !== 'error').length).toBeGreaterThan(40)
    // The rows are JSON values: arrays of numbers and nulls, objects with a mode and sizes, and the word `error`.
    expect(JSON.parse(JSON.stringify(model))).toEqual(JSON.parse(canonicalJson(model)))
  })
})

describe('the tables, in the repository', () => {
  const found = readTable(root)

  test('DISPATCH_TABLES says what the repository holds: waiting until the tables are committed, committed after', () => {
    expect(DISPATCH_TABLES.question).toBe('Q-10')
    expect(DISPATCH_TABLES.table).toBe(`${TABLE_DIR}/${TABLE_FILE}`)
    expect(DISPATCH_TABLES.script).toBe('scripts/tables/vllm-dispatch.py')
    expect(DISPATCH_TABLES.pin).toContain(PIN.commit)
    expect(tablesStatus(root)).toBe(found === null ? 'waiting' : 'present')
    expect(DISPATCH_TABLES.status).toBe(found === null ? 'waiting' : 'committed')
  })

  test.skipIf(found === null)('the committed table has the SHA-256 that its .sha256 file names, and says who made it, where and when', () => {
    expect(found?.hashOk).toBe(true)
    expect(found?.table.meta.provenance).toMatch(/^\[measured by .+ on a CPU host, \d{4}-\d{2}-\d{2}(; the owner's confirmation is open \(Q-10\))?\]$/)
    expect(found?.table.meta.script.sha256).toBe(sha256(readFileSync(path.join(root, 'scripts/tables/vllm-dispatch.py'), 'utf8')))
    expect(found?.table.meta.failed ?? []).toEqual([])
    expect(found?.table.meta.counts.v2).toBeGreaterThanOrEqual(MIN_CASES)
    expect(found?.table.meta.counts.v1).toBeGreaterThanOrEqual(MIN_CASES)
  })

  test.skipIf(found === null)('dispatchV2 and dispatchV1 agree with the committed table on every one of at least 5,000 cases each', () => {
    const verdict = checkTable(cases, (found as NonNullable<typeof found>).table)
    expect(verdict.problems).toEqual([])
    expect(verdict.checked.v2).toBeGreaterThanOrEqual(MIN_CASES)
    expect(verdict.checked.v1).toBeGreaterThanOrEqual(MIN_CASES)
  })

  test.skipIf(found !== null)('while the tables are waiting, nothing in tests/fixtures/dispatch claims to be one', () => {
    expect(existsSync(path.join(root, TABLE_DIR, TABLE_FILE))).toBe(false)
    expect(existsSync(path.join(root, TABLE_DIR, `${TABLE_FILE}.sha256`))).toBe(false)
  })
})

describe('the command line', () => {
  const run = (...args: string[]) => spawnSync('bun', ['scripts/tables/dispatch-cases.ts', ...args], { cwd: root, encoding: 'utf8' })
  const dir = mkdtempSync(path.join(tmpdir(), 'dispatch-tables-'))

  test('--write puts the cases in a file, and says how many and their hash', () => {
    const file = path.join(dir, 'cases.json')
    const r = run('--write', file)
    expect(r.status).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(renderCases(cases))
    expect(r.stdout).toContain(`${cases.v2.cases.length} MRV2 cases, ${cases.v1.cases.length} MRV1 cases`)
    expect(r.stdout).toContain(casesSha256(cases))
  })

  test('--status says the tables are waiting, with exit 0, while there are none', () => {
    const r = run('--status')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain(committedTable() === null ? "have not been generated: W1-T13's keys level waits (Q-10)" : 'are committed')
  })

  test('--check exits 3 when there is no table, 0 on a table the model agrees with, and 1 on one it does not or whose hash is wrong', () => {
    expect(run('--check', path.join(dir, 'nothing-here')).status).toBe(3)
    const good = path.join(dir, 'good')
    mkdirSync(good)
    const text = `${JSON.stringify(standInTable())}\n`
    writeFileSync(path.join(good, TABLE_FILE), text)
    writeFileSync(path.join(good, `${TABLE_FILE}.sha256`), `${sha256(text)}  ${TABLE_FILE}\n`)
    const ok = run('--check', good)
    expect(ok.status).toBe(0)
    expect(ok.stdout).toContain(`agrees with the tables on ${cases.v2.cases.length} MRV2 cases`)

    const wrongHash = path.join(dir, 'wrong-hash')
    mkdirSync(wrongHash)
    writeFileSync(path.join(wrongHash, TABLE_FILE), text)
    writeFileSync(path.join(wrongHash, `${TABLE_FILE}.sha256`), `${'0'.repeat(64)}  ${TABLE_FILE}\n`)
    const bad = run('--check', wrongHash)
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('does not have the SHA-256')

    const wrongRow = path.join(dir, 'wrong-row')
    mkdirSync(wrongRow)
    const edited = standInTable()
    ;(edited.results.v1[10] as unknown as number[])[0] = 9
    const editedText = `${JSON.stringify(edited)}\n`
    writeFileSync(path.join(wrongRow, TABLE_FILE), editedText)
    writeFileSync(path.join(wrongRow, `${TABLE_FILE}.sha256`), `${sha256(editedText)}  ${TABLE_FILE}\n`)
    const differs = run('--check', wrongRow)
    expect(differs.status).toBe(1)
    expect(differs.stderr).toContain('v1 case 10')
  })

  test('refuses what it does not know', () => {
    expect(run().status).toBe(2)
    expect(run('--write').status).toBe(2)
    expect(run('--frobnicate').status).toBe(2)
    rmSync(dir, { recursive: true, force: true })
  })
})

/** The committed table, or null. */
function committedTable() {
  return readTable(root)
}

describe('the script that runs vLLM (scripts/tables/vllm-dispatch.py), read as text', () => {
  const script = readFileSync(path.join(root, 'scripts/tables/vllm-dispatch.py'), 'utf8')

  test('is for the pin of the lockfile: the commit it expects and the file it writes', () => {
    expect(script).toContain(`EXPECTED_COMMIT = '${PIN.commit}'`)
    expect(script).toContain(`TABLE_FILE = '${TABLE_FILE}'`)
    expect(script).toContain(`SCHEMA_CASES = '${CASES_SCHEMA}'`)
    expect(script).toContain(`SCHEMA_TABLE = '${TABLE_SCHEMA}'`)
  })

  test('runs vLLM\'s code and nothing else: it imports only the standard library, torch for its version, and vLLM; it calls no shell, no eval and no network, and writes only the table and its hash', () => {
    const imported = [...script.matchAll(/^\s*import\s+([\w.]+)\s*$/gm), ...script.matchAll(/^\s*from\s+([\w.]+)\s+import\s/gm)].map((m) => m[1].split('.')[0])
    expect(imported.length).toBeGreaterThan(10)
    const allowed = new Set(['argparse', 'datetime', 'hashlib', 'json', 'os', 'platform', 'sys', 'tarfile', 'types', 'torch', 'vllm'])
    expect(imported.filter((name) => !allowed.has(name))).toEqual([])
    for (const banned of ['os.system(', 'os.popen(', 'os.exec', 'os.spawn', 'eval(', 'exec(', '__import__(', 'compile(', 'open(sys.argv']) expect(script.includes(banned), banned).toBe(false)
    // The only files it opens for writing are the table and its hash, under --out.
    const writes = [...script.matchAll(/open\(([^)]*), '(w|wb|a)'/g)].map((m) => m[1])
    expect(writes).toEqual(['path', "path + '.sha256'"])
  })

  test('says in its header how to run it, with -I, and what the run needs', () => {
    for (const phrase of ['python -I scripts/tables/vllm-dispatch.py', 'uv venv', 'torch==2.14.0', 'requirements/common.txt', 'bun scripts/tables/dispatch-cases.ts --write', 'bun scripts/tables/dispatch-cases.ts --check', 'git get-tar-commit-id']) {
      expect(script, phrase).toContain(phrase)
    }
  })

  test('replaces three things and no more: the pipeline-parallel group, the platform\'s graph pool, and the platform query in the sizes function', () => {
    const patched = [...script.matchAll(/v\.(?:manager_v2|platforms)\.(\w+) = /g)].map((m) => m[1])
    expect(patched.sort()).toEqual(['current_platform', 'current_platform', 'current_platform', 'get_pp_group'])
  })

  const python = spawnSync('python3', ['--version'], { encoding: 'utf8' })
  test.skipIf(python.status !== 0)('parses as Python 3', () => {
    const r = spawnSync('python3', ['-I', '-c', 'import ast, sys; ast.parse(open(sys.argv[1]).read())', path.join(root, 'scripts/tables/vllm-dispatch.py')], { encoding: 'utf8' })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
})
