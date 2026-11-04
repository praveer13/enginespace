/*
 * W0-T04's gate registry, scripts/verify.ts, against the documents it implements and as a command line.
 *
 *   - The registry has exactly ARCHITECTURE §10.2's gates in its order, and each command's task is one that TRACKER.md has and
 *     whose text names the gate (or the command's script). A mistyped task id fails here.
 *   - package.json reaches every gate, and verify:all, through the registry and nowhere else, so verify:all cannot miss one.
 *   - Every scripts/verify-*.ts file is some gate's command. A task that lands a gate script the registry does not name fails
 *     the merged tree's tests instead of leaving the gate pending for ever.
 *   - A gate whose script is not built prints `pending: <task>` and exits 0; one that is built runs and can fail; `all` goes on
 *     past a failure and says which gates failed.
 *
 * The command line runs on a fake machine (no files, no processes), and once as a real process in an empty tree.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GATE_NAMES, GATES, main, STAGES } from '../../scripts/verify'
import type { GateName, Host, Stage } from '../../scripts/verify'
import { backticked, between, read, root, tableRows, trackerTasks } from './support'

const architecture = read('docs/ARCHITECTURE.md')
const commands = GATE_NAMES.flatMap((name) => GATES[name].parts.map((part) => ({ name, ...part })))
const tasksOf = (name: GateName) => [...new Set(GATES[name].parts.map((part) => part.task))]
const inStage = (stage: Stage) => GATE_NAMES.filter((name) => GATES[name].stage === stage)
const total = GATE_NAMES.length

describe('the registry against ARCHITECTURE §10.2 and TRACKER.md', () => {
  const section = between(architecture, '### 10.2 Gates', "Kernelspace's pattern applies")
  const documented = tableRows(section).map(([cell]) => backticked(cell)[0])

  test('§10.2 parses into its gates', () => {
    expect(documented.length).toBeGreaterThan(10)
    expect(documented).toContain('verify:bundle')
  })

  test('the registry has the gates of §10.2, in its order', () => {
    expect(GATE_NAMES.map((name) => `verify:${name}`)).toEqual(documented)
  })

  test('every command is built by a task that TRACKER.md has, and that task names the gate or the script', () => {
    const tasks = trackerTasks()
    expect(tasks.size).toBeGreaterThan(100)
    const problems = commands.flatMap(({ name, task, script }) => {
      const text = tasks.get(task)
      if (text === undefined) return [`verify:${name} waits for ${task}, which TRACKER.md does not have`]
      if (!text.includes(`verify:${name}`) && !text.includes(script)) return [`${task} names neither verify:${name} nor ${script}`]
      return []
    })
    expect(problems).toEqual([])
  })

  test('a command is a TypeScript script under scripts/', () => {
    for (const { script } of commands) expect(script).toMatch(/^scripts\/[\w/-]+\.ts$/)
  })

  test('verify:bundle reads the build, and verify:labs needs the Rust toolchain', () => {
    // ci.yml runs the gates of the source stage before `npm run build`, and those of the build stage after it. labs.yml alone has Rust.
    expect(GATES.bundle.stage).toBe('build')
    expect(GATES.labs.stage).toBe('toolchain')
    expect(inStage('source').length).toBeGreaterThan(total / 2)
  })

  test('every scripts/verify-*.ts file is the command of some gate', () => {
    const registered = new Set(commands.map(({ script }) => script))
    const stray = readdirSync(path.join(root, 'scripts'))
      .filter((file) => /^verify-.+\.ts$/.test(file))
      .map((file) => `scripts/${file}`)
      .filter((script) => !registered.has(script))
    if (stray.length > 0) {
      throw new Error(`${stray.join(', ')} look like gate scripts, but no gate in scripts/verify.ts runs them: register the gate, or name the file otherwise`)
    }
  })
})

describe('package.json', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts

  test('has verify:all and one verify:<gate> for each gate, all through the registry, and no other verify script', () => {
    const expected: Record<string, string> = {
      'verify:all': 'bun scripts/verify.ts all',
      ...Object.fromEntries(GATE_NAMES.map((name) => [`verify:${name}`, `bun scripts/verify.ts ${name}`])),
    }
    const found = Object.fromEntries(Object.entries(scripts).filter(([name]) => name.startsWith('verify')))
    const problems = [
      ...Object.entries(expected)
        .filter(([name, command]) => found[name] !== command)
        .map(([name, command]) => `${name} is ${found[name] === undefined ? 'missing' : `"${found[name]}"`}, and must be "${command}": the registry already names the gate's script, and verify:all runs only what it names`),
      ...Object.keys(found)
        .filter((name) => !(name in expected))
        .map((name) => `${name} is not a gate of scripts/verify.ts: register the gate there, and run it here as "bun scripts/verify.ts <gate>"`),
    ]
    expect(problems).toEqual([])
  })
})

/** A machine with the given files, on which every command exits 0 unless its script is listed in `fail`. */
function machine(options: { files?: string[]; fail?: string[]; env?: Record<string, string> } = {}) {
  const files = new Set(options.files ?? [])
  const out: string[] = []
  const ran: string[][] = []
  const host: Host = {
    bun: 'bun',
    env: options.env ?? {},
    exists: (file) => files.has(file),
    run: (command) => {
      ran.push([...command])
      return options.fail?.includes(command[1]) ? 1 : 0
    },
    print: (line) => out.push(line),
  }
  return { host, out, ran }
}

/** Every script the registry runs. */
const everything = commands.map(({ script }) => script)

describe('one gate', () => {
  test('whose script is not built prints "pending: <task>" and exits 0, and runs nothing', () => {
    for (const name of GATE_NAMES) {
      const { host, out, ran } = machine()
      expect(main([name], host)).toBe(0)
      expect(out).toEqual([`verify:${name}: pending: ${tasksOf(name).join(', ')}`])
      expect(ran).toEqual([])
    }
  })

  test('whose script is built runs it from the registry, with the registry\'s arguments before the caller\'s', () => {
    const { host, out, ran } = machine({ files: ['scripts/vendor-drift.ts'] })
    expect(main(['vendor', '--json'], host)).toBe(0)
    expect(ran).toEqual([['bun', 'scripts/vendor-drift.ts', 'verify', '--json']])
    expect(out).toEqual(['$ bun scripts/vendor-drift.ts verify --json'])
  })

  test('whose script fails exits 1 and says which script', () => {
    const { host, out } = machine({ files: ['scripts/verify-kc.ts'], fail: ['scripts/verify-kc.ts'] })
    expect(main(['kc'], host)).toBe(1)
    expect(out).toContain('verify:kc failed: scripts/verify-kc.ts exited with 1')
  })

  test('with two commands runs the one that is built and names the task of the other', () => {
    const { host, out, ran } = machine({ files: ['scripts/verify-determinism.ts'] })
    expect(main(['determinism'], host)).toBe(0)
    expect(ran).toEqual([['bun', 'scripts/verify-determinism.ts']])
    expect(out).toContain('verify:determinism: pending: W0-T12')
  })

  test('with two commands runs both, and runs the second when the first fails', () => {
    const files = ['scripts/verify-determinism.ts', 'scripts/vectors.ts']
    const both = machine({ files })
    expect(main(['determinism'], both.host)).toBe(0)
    expect(both.ran).toEqual([
      ['bun', 'scripts/verify-determinism.ts'],
      ['bun', 'scripts/vectors.ts', '--check'],
    ])
    expect(both.out.some((line) => line.includes('pending'))).toBe(false)

    const failing = machine({ files, fail: ['scripts/verify-determinism.ts'] })
    expect(main(['determinism'], failing.host)).toBe(1)
    expect(failing.ran.length).toBe(2)
  })
})

describe('all', () => {
  test('with nothing built exits 0 and names every gate\'s task in the summary', () => {
    const { host, out, ran } = machine()
    expect(main(['all'], host)).toBe(0)
    expect(ran).toEqual([])
    expect(out).toContain(`verify:all: ${total} gates, 0 passed, ${total} pending, 0 failed`)
    for (const name of GATE_NAMES) expect(out.some((line) => line.startsWith(`  ${name} `) && line.endsWith(`pending: ${tasksOf(name).join(', ')}`))).toBe(true)
  })

  test('runs every built gate in order, goes on past a failure, and exits 1', () => {
    const { host, out, ran } = machine({ files: everything, fail: ['scripts/verify-kc.ts'] })
    expect(main(['all'], host)).toBe(1)
    expect(ran.map((command) => command.slice(1).join(' '))).toEqual(
      commands.map(({ script, args }) => [script, ...args].join(' ')),
    )
    expect(out).toContain(`verify:all: ${total} gates, ${total - 1} passed, 0 pending, 1 failed`)
    expect(out.find((line) => line.startsWith('  kc '))).toMatch(/ FAILED$/)
    expect(out.find((line) => line.startsWith('  vendor '))).toMatch(/ passed$/)
  })

  test('counts a gate with a built command and a pending one as passed, and still names the task', () => {
    const { host, out } = machine({ files: ['scripts/verify-determinism.ts'] })
    expect(main(['all'], host)).toBe(0)
    expect(out).toContain(`verify:all: ${total} gates, 1 passed, ${total - 1} pending, 0 failed`)
    expect(out.find((line) => line.startsWith('  determinism '))).toMatch(/ passed; pending: W0-T12$/)
  })

  test('--stage runs only that stage\'s gates, in either spelling', () => {
    for (const stage of STAGES) {
      const gates = inStage(stage)
      const expected = gates.flatMap((name) => GATES[name].parts.map(({ script, args }) => [script, ...args].join(' ')))
      for (const argv of [['all', '--stage', stage], ['all', `--stage=${stage}`]]) {
        const { host, out, ran } = machine({ files: everything })
        expect(main(argv, host)).toBe(0)
        expect(ran.map((command) => command.slice(1).join(' '))).toEqual(expected)
        expect(out).toContain(`verify:all (stage ${stage}): ${gates.length} gates, ${gates.length} passed, 0 pending, 0 failed`)
      }
    }
  })
})

describe('under GitHub Actions', () => {
  test('a built gate\'s output is grouped, and a failure is annotated', () => {
    const { host, out } = machine({ files: ['scripts/verify-kc.ts'], fail: ['scripts/verify-kc.ts'], env: { GITHUB_ACTIONS: 'true' } })
    expect(main(['kc'], host)).toBe(1)
    expect(out).toEqual([
      '::group::verify:kc',
      '$ bun scripts/verify-kc.ts',
      '::endgroup::',
      '::error title=verify:kc::verify:kc failed: scripts/verify-kc.ts exited with 1',
    ])
  })

  test('a pending gate prints the same line as anywhere else', () => {
    const { host, out } = machine({ env: { GITHUB_ACTIONS: 'true' } })
    expect(main(['routes'], host)).toBe(0)
    expect(out).toEqual(['verify:routes: pending: W0-T19'])
  })
})

describe('list', () => {
  test('prints each command with its stage, its status and its task', () => {
    const { host, out } = machine({ files: ['scripts/verify-bundle.ts', 'scripts/vectors.ts'] })
    expect(main(['list'], host)).toBe(0)
    expect(out[0]).toMatch(/^gate +stage +status +task +command$/)
    expect(out.length).toBe(1 + commands.length)
    expect(out.find((line) => line.startsWith('bundle '))).toMatch(/^bundle +build +live +W0-T20 +scripts\/verify-bundle\.ts$/)
    expect(out.find((line) => line.startsWith('content '))).toMatch(/^content +source +pending +W0-T08 +scripts\/verify-content\.ts$/)
    expect(out.find((line) => line.endsWith('scripts/vectors.ts --check'))).toMatch(/^ +live +W0-T12 +scripts\/vectors\.ts --check$/)
  })
})

describe('usage', () => {
  const failing: [string, string[]][] = [
    ['no argument', []],
    ['an unknown gate', ['nope']],
    ['an unknown stage', ['all', '--stage', 'nope']],
    ['a stage without a value', ['all', '--stage']],
    ['a stray argument to all', ['all', 'content']],
    ['an argument to list', ['list', 'content']],
  ]
  for (const [what, argv] of failing) {
    test(`${what} exits 2 and prints the usage with the gates`, () => {
      const { host, out, ran } = machine({ files: everything })
      expect(main(argv, host)).toBe(2)
      expect(out.join('\n')).toContain('usage: bun scripts/verify.ts')
      expect(out.join('\n')).toContain(GATE_NAMES.join(', '))
      expect(ran).toEqual([])
    })
  }

  test('--help exits 0', () => {
    const { host, out } = machine()
    expect(main(['--help'], host)).toBe(0)
    expect(out.join('\n')).toContain('usage: bun scripts/verify.ts')
  })
})

describe('as a process, in a tree of its own', () => {
  // Each test gets a copy of the script in a tree of its own, and writes the scripts it needs: without them every gate is pending.
  const trees: string[] = []
  afterAll(() => trees.forEach((tree) => rmSync(tree, { recursive: true, force: true })))

  function tree(files: Record<string, string> = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-verify-'))
    trees.push(dir)
    mkdirSync(path.join(dir, 'scripts'))
    copyFileSync(path.join(root, 'scripts/verify.ts'), path.join(dir, 'scripts/verify.ts'))
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { 'verify:all': 'bun scripts/verify.ts all' } }))
    for (const [name, source] of Object.entries(files)) writeFileSync(path.join(dir, name), source)
    const run = (...command: string[]) => {
      const result = spawnSync(process.execPath, command, { cwd: dir, encoding: 'utf8' })
      return { status: result.status, output: `${result.stdout}${result.stderr}` }
    }
    return { dir, verify: (...args: string[]) => run('scripts/verify.ts', ...args), bunRun: (...args: string[]) => run('run', ...args) }
  }

  test('verify all passes in an empty tree and names the task of every pending gate', () => {
    const { status, output } = tree().verify('all')
    expect(status).toBe(0)
    expect(output).toContain(`verify:all: ${total} gates, 0 passed, ${total} pending, 0 failed`)
    for (const name of GATE_NAMES) expect(output).toMatch(new RegExp(`\\n {2}${name} +pending: ${tasksOf(name).join(', ')}\\n`))
  })

  test('a gate script runs from the tree\'s root with the registry\'s arguments first', () => {
    const { dir, verify } = tree({ 'scripts/vendor-drift.ts': 'console.log(JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2) }))\n' })
    const { status, output } = verify('vendor', '--extra')
    expect(status).toBe(0)
    expect(output).toContain(JSON.stringify({ cwd: realpathSync(dir), argv: ['verify', '--extra'] }))
  })

  test('a failing gate script fails its gate and verify all, and the gates after it still run', () => {
    const { verify } = tree({
      'scripts/verify-kc.ts': 'console.error("kc is broken"); process.exit(1)\n',
      'scripts/verify-items.ts': 'console.log("items ran")\n',
    })
    expect(verify('kc').status).toBe(1)
    const all = verify('all')
    expect(all.status).toBe(1)
    expect(all.output).toContain('kc is broken')
    expect(all.output).toContain('items ran')
    expect(all.output).toMatch(/\n {2}kc +FAILED\n/)
    expect(all.output).toMatch(/\n {2}items +passed\n/)
  })

  test('`bun run verify:all --stage <stage>`, the form ci.yml uses, hands the stage to the script', () => {
    const { bunRun } = tree()
    for (const stage of STAGES) {
      const gates = inStage(stage).length
      const { status, output } = bunRun('verify:all', '--stage', stage)
      expect(status).toBe(0)
      expect(output).toContain(`verify:all (stage ${stage}): ${gates} gates, 0 passed, ${gates} pending, 0 failed`)
    }
  })
})
