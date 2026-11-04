/*
 * W1-T11, accept 3: the agent kit's guard hook blocks an edit to the harness file. And the rest of what the guard is for.
 *
 * The kit in every lab zip keeps a coding agent out of two files: the learner's (`TODO(you)`, "yours to write") and the harness
 * (DO NOT EDIT, "stays as shipped"). These tests do not read labs/agent-kit. They unpack the toy lab's zip as a learner would, read
 * `.claude/settings.json` out of it, and run the hook commands that file names, with the payloads Claude Code sends a PreToolUse hook
 * (a JSON document on stdin; exit 2 blocks, 0 allows), so that what is tested is what ships, wired as it ships. A tool call is
 * blocked when any of the hooks blocks it, which is how Claude Code treats several hooks on one matcher.
 *
 * The hook is kernelspace's ks-guard.sh, renamed, with one flag added (`--harness`, which changes the message). The last test holds the
 * file to that: take the vendored hook, apply the rename, and it is the shipped hook minus the blocks that it marks as enginespace's.
 * The matrix is kernelspace's (scripts/verify-guardrails.ts at d478f91), for each of the two files, plus the cases that make it fail closed.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildArchive, type LabArchive } from '../../scripts/pack-labs'
import { readZip } from '../../scripts/labs/zip'
import { FORGE_LABS } from '../../src/forge/labs'
import { read } from '../ci/support'

// Every call below starts shells, a few dozen of them for a matrix, and the machine may be busy.
setDefaultTimeout(60_000)

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-guard-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** The toy lab's zip, unpacked where a learner would unpack it. */
function unpack(archive: LabArchive, name: string): string {
  const into = path.join(scratch, name)
  for (const entry of readZip(archive.zip)) {
    const file = path.join(into, entry.name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, entry.data)
    chmodSync(file, entry.mode)
  }
  return path.join(into, archive.root)
}

const archive = buildArchive(FORGE_LABS.toy)
const project = unpack(archive, 'zip')
const settings = JSON.parse(readFileSync(path.join(project, '.claude/settings.json'), 'utf8')) as {
  permissions: { deny: string[] }
  hooks: { PreToolUse: { matcher: string; hooks: { type: string; command: string; timeout: number }[] }[] }
  outputStyle: string
}
const commands = settings.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((hook) => hook.command))
const TODO = archive.todoFile
const HARNESS = archive.harnessFile

const baseEnv = () => {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), CLAUDE_PROJECT_DIR: project }
  delete env.ES_SOLO
  return env
}

interface Run {
  status: number | null
  stderr: string
}

/** One hook command of settings.json, run as Claude Code runs it: `sh -c`, the project folder in the environment, the call on stdin. */
function runCommand(command: string, stdin: string, env: Record<string, string> = {}): Run {
  const run = spawnSync('sh', ['-c', command], { input: stdin, env: { ...baseEnv(), ...env }, cwd: project, encoding: 'utf8', timeout: 10_000 })
  return { status: run.status, stderr: run.stderr }
}

/** What Claude Code does with the call: it is blocked when any hook exits 2. */
function verdict(stdin: unknown, env: Record<string, string> = {}): 'deny' | 'allow' | string {
  const text = typeof stdin === 'string' ? stdin : JSON.stringify(stdin)
  const runs = commands.map((command) => runCommand(command, text, env))
  if (runs.some((run) => run.status === 2)) return 'deny'
  if (runs.every((run) => run.status === 0)) return 'allow'
  return `exit ${runs.map((run) => run.status).join(',')}`
}

const call = (tool: string, input: Record<string, unknown>) => ({ session_id: 'fixture', cwd: project, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input })

/** The matrix, for one protected file: what the guard must block, what it must allow, and the payloads it cannot read. */
function matrix(file: string): { name: string; stdin: unknown; env?: Record<string, string>; expect: 'deny' | 'allow' }[] {
  const base = file.slice(file.lastIndexOf('/') + 1)
  const abs = `/work/${file}`
  const deny = (name: string, stdin: unknown) => ({ name, stdin, expect: 'deny' as const })
  const allow = (name: string, stdin: unknown, env?: Record<string, string>) => ({ name, stdin, ...(env === undefined ? {} : { env }), expect: 'allow' as const })
  return [
    deny('an Edit of the file', call('Edit', { file_path: abs, old_string: 'a', new_string: 'b' })),
    deny('a Write of the file', call('Write', { file_path: abs, content: 'x' })),
    deny('a MultiEdit of the file', call('MultiEdit', { file_path: abs, edits: [] })),
    deny('a NotebookEdit of the file', call('NotebookEdit', { notebook_path: abs, new_source: 'x' })),
    deny('an Edit by a path from the crate folder', call('Edit', { file_path: `src/${base}`, new_string: 'b' })),
    deny('an Edit by the bare name', call('Edit', { file_path: base, new_string: 'b' })),
    deny('an Edit by a Windows path', call('Edit', { file_path: `C:\\ws\\${file.replaceAll('/', '\\')}`, new_string: 'b' })),
    deny('an Edit by a path in capitals', call('Edit', { file_path: `/ws/${file.toUpperCase()}`, new_string: 'b' })),
    deny('an Edit by an escaped path', `{"tool_name":"Edit","tool_input":{"file_path":"/ws/src/\\u${base.charCodeAt(0).toString(16).padStart(4, '0')}${base.slice(1)}"}}`),
    deny('an Edit with no path at all', call('Edit', { old_string: 'a' })),
    deny('sed -i on the file', call('Bash', { command: `sed -i 's/a/b/' ${file}` })),
    deny('a redirect into the file', call('Bash', { command: `cat notes.txt > ${file}` })),
    deny('an append to the file', call('Bash', { command: `echo x >> ${file}` })),
    deny('a copy over the file', call('Bash', { command: `cp ../solution/${base} ${file}` })),
    deny('tee into the file', call('Bash', { command: `cat a.txt | tee ${file}` })),
    deny('git checkout of the file', call('Bash', { command: `git checkout HEAD~3 -- ${file}` })),
    deny('a script that opens the file', call('Bash', { command: `python3 -c "open('${file}','w').write('x')"` })),
    deny('a read-only command chained to a write', call('Bash', { command: `cat ${file}; rm ${file}` })),
    deny('a read-only command in a substitution', call('Bash', { command: `cat $(echo ${file})` })),
    deny('a Bash call with no command', call('Bash', {})),
    deny('an mcp tool that names the file', call('mcp__fs__write_file', { path: abs, content: 'x' })),
    deny('an unparseable payload', 'this is not json'),
    deny('an empty payload', ''),
    deny('a truncated payload', '{"tool_name":"Edit","tool_input":{"file_pa'),
    deny('a payload with no tool name', '{"tool_input":{"command":"ls"}}'),
    allow('cargo test', call('Bash', { command: 'cargo test' })),
    allow('cargo build for wasm', call('Bash', { command: 'cargo build --release --target wasm32-unknown-unknown' })),
    allow('a read-only look at the file', call('Bash', { command: `grep -n TODO ${file} | head -5` })),
    allow('cat piped to wc', call('Bash', { command: `cat ${file} | wc -l` })),
    allow('git diff of the file', call('Bash', { command: `git diff -- ${file}` })),
    allow('a command that never names it', call('Bash', { command: 'rm -rf target' })),
    allow('an Edit of README.md that speaks of the file', call('Edit', { file_path: '/work/README.md', new_string: `see ${base}` })),
    allow('an Edit of a test the learner owns', call('Edit', { file_path: '/work/toy/tests/checks.rs', new_string: 'b' })),
    allow('a Write whose text fakes a file_path key', call('Write', { file_path: '/work/NOTES.md', content: `edit ${base}\n{"file_path":"/work/${file}"}` })),
    allow('an mcp tool that never names the file', call('mcp__fs__list', { path: '/work' })),
    allow('a tool the matcher never sends', call('Read', { file_path: abs })),
    allow('an Edit with ES_SOLO=0', call('Edit', { file_path: abs, new_string: 'b' }), { ES_SOLO: '0' }),
    allow('an unparseable payload with ES_SOLO=0', 'garbage', { ES_SOLO: '0' }),
  ]
}

describe('the shipped wiring', () => {
  test('denies Edit of both files, and runs the guard once for each, the harness one with --harness', () => {
    expect(settings.permissions.deny).toEqual([`Edit(/${TODO})`, `Edit(/${HARNESS})`])
    expect(settings.hooks.PreToolUse).toHaveLength(1)
    expect(settings.hooks.PreToolUse[0]?.matcher).toBe('Edit|Write|MultiEdit|NotebookEdit|Bash|mcp__.*')
    expect(commands).toEqual([
      `sh "\${CLAUDE_PROJECT_DIR}/.claude/hooks/es-guard.sh" ${TODO}`,
      `sh "\${CLAUDE_PROJECT_DIR}/.claude/hooks/es-guard.sh" --harness ${HARNESS}`,
    ])
    for (const hook of settings.hooks.PreToolUse.flatMap((entry) => entry.hooks)) expect(hook).toMatchObject({ type: 'command', timeout: 10 })
    expect(settings.outputStyle).toBe('enginespace-socratic')
  })

  test('the two files are the lab\'s: its harness, marked DO NOT EDIT, and the one file marked TODO(you)', () => {
    expect([TODO, HARNESS]).toEqual(['toy/src/rotation.rs', 'toy/src/lib.rs'])
    expect(readFileSync(path.join(project, HARNESS), 'utf8')).toContain('DO NOT EDIT this file')
    expect(readFileSync(path.join(project, TODO), 'utf8')).toMatch(/^\/\/! TODO\(you\)/m)
  })
})

describe('accept 3: the guard blocks an edit to the harness file', () => {
  const edit = (tool: string, input: Record<string, unknown>) => verdict(call(tool, input))

  test('every edit tool, by every spelling of the path', () => {
    for (const tool of ['Edit', 'Write', 'MultiEdit']) {
      expect([tool, edit(tool, { file_path: path.join(project, HARNESS) })]).toEqual([tool, 'deny'])
      expect([tool, edit(tool, { file_path: HARNESS })]).toEqual([tool, 'deny'])
      expect([tool, edit(tool, { file_path: 'lib.rs' })]).toEqual([tool, 'deny'])
    }
    expect(edit('NotebookEdit', { notebook_path: path.join(project, HARNESS) })).toBe('deny')
  })

  test('a shell command that would change it, and an mcp tool that would', () => {
    expect(verdict(call('Bash', { command: `sed -i 's/CHURN_LABEL/x/' ${HARNESS}` }))).toBe('deny')
    expect(verdict(call('Bash', { command: `echo '// patched' >> ${HARNESS}` }))).toBe('deny')
    expect(verdict(call('mcp__editor__apply_patch', { path: HARNESS, patch: '...' }))).toBe('deny')
  })

  test('it is the harness hook that says so, in the harness\'s words, and the learner\'s file keeps its own', () => {
    const [todoHook, harnessHook] = commands as [string, string]
    const harnessEdit = JSON.stringify(call('Edit', { file_path: path.join(project, HARNESS) }))
    const todoEdit = JSON.stringify(call('Edit', { file_path: path.join(project, TODO) }))
    expect(runCommand(todoHook, harnessEdit).status).toBe(0)
    expect(runCommand(harnessHook, harnessEdit)).toEqual({
      status: 2,
      stderr: `enginespace: ${HARNESS} is the lab's grading harness, and it stays as shipped. Ask about the failing check instead: name it, its invariant and your hypothesis. Set ES_SOLO=0 to turn this guard off.\n`,
    })
    expect(runCommand(harnessHook, todoEdit).status).toBe(0)
    expect(runCommand(todoHook, todoEdit)).toEqual({
      status: 2,
      stderr: `enginespace: ${TODO} is yours to write. Ask about the failing check instead: name it, its invariant and your hypothesis. Set ES_SOLO=0 to turn this guard off.\n`,
    })
  })
})

describe('the matrix, for each protected file', () => {
  for (const [what, file] of [['the learner\'s file', TODO], ['the harness', HARNESS]] as const) {
    test(`${what} (${file}): everything the guard must block is blocked, and the rest is not`, () => {
      const wrong = matrix(file).flatMap((fixture) => {
        const got = verdict(fixture.stdin, fixture.env)
        return got === fixture.expect ? [] : [`${fixture.name}: expected ${fixture.expect}, got ${got}`]
      })
      expect(wrong).toEqual([])
    })
  }

  test('has teeth: a hook that allows everything and a hook that blocks everything both fail it', () => {
    for (const body of ['exit 0', 'exit 2']) {
      const script = path.join(scratch, `teeth-${body.replace(' ', '-')}.sh`)
      writeFileSync(script, `#!/bin/sh\ncat >/dev/null\n${body}\n`)
      const wrong = matrix(HARNESS).filter((fixture) => {
        const stdin = typeof fixture.stdin === 'string' ? fixture.stdin : JSON.stringify(fixture.stdin)
        const run = spawnSync('sh', [script, '--harness', HARNESS], { input: stdin, env: { ...baseEnv(), ...fixture.env }, encoding: 'utf8' })
        return (run.status === 2 ? 'deny' : 'allow') !== fixture.expect
      })
      expect(wrong.length, body).toBeGreaterThan(0)
    }
  })

  test('each hook guards its own file and not the other one', () => {
    const [todoHook, harnessHook] = commands as [string, string]
    const edit = (file: string) => JSON.stringify(call('Edit', { file_path: path.join(project, file) }))
    expect([runCommand(todoHook, edit(TODO)).status, runCommand(todoHook, edit(HARNESS)).status]).toEqual([2, 0])
    expect([runCommand(harnessHook, edit(HARNESS)).status, runCommand(harnessHook, edit(TODO)).status]).toEqual([2, 0])
  })
})

describe('failing closed, and the switch', () => {
  const hook = path.join(project, '.claude/hooks/es-guard.sh')
  const run = (args: string[], stdin: string, env: Record<string, string> = {}) => spawnSync('sh', [hook, ...args], { input: stdin, env: { ...baseEnv(), ...env }, encoding: 'utf8' })

  test('started with no protected file, or with --harness and none, it blocks everything', () => {
    for (const args of [[], ['--harness']]) {
      const out = run(args, JSON.stringify(call('Read', {})))
      expect([args, out.status]).toEqual([args, 2])
      expect(out.stderr).toContain('started without a protected file')
    }
  })

  test('ES_SOLO=0 turns it off, and anything else does not', () => {
    const stdin = JSON.stringify(call('Edit', { file_path: `/ws/${HARNESS}` }))
    for (const [value, want] of [['0', 0], ['1', 2], ['', 2], ['00', 2]] as const) {
      expect([value, run(['--harness', HARNESS], stdin, { ES_SOLO: value }).status]).toEqual([value, want])
    }
    // kernelspace's switch is not this course's.
    expect(run(['--harness', HARNESS], stdin, { KS_SOLO: '0' }).status).toBe(2)
  })

  test('a large Write to another file is judged well inside the 10 s budget', () => {
    const big = 'fn f() { let s = "{"; }\n'.repeat(40_000)
    const started = Date.now()
    expect(verdict(call('Write', { file_path: '/ws/NOTES.md', content: big }))).toBe('allow')
    expect(Date.now() - started).toBeLessThan(8000)
  })
})

describe('the hook is kernelspace\'s, renamed', () => {
  /** The rename of enginespace's kit: the names a learner sees, and the one flag's worth of enginespace's own code, marked in the file. */
  const renamed = (text: string) => text.replaceAll('kernelspace', 'enginespace').replaceAll('ks-guard', 'es-guard').replaceAll('KS_SOLO', 'ES_SOLO').replaceAll('ks_done', 'es_done')
  const vendored = read('vendor/kernelspace/labs/agent-kit/hooks/ks-guard.sh')
  const shipped = readFileSync(path.join(project, '.claude/hooks/es-guard.sh'), 'utf8')
  const MARKED = /^[ \t]*# >>> enginespace\n[\s\S]*?^[ \t]*# <<< enginespace\n/gm

  test('without the blocks it marks as its own, it is the vendored hook with the names changed, line for line', () => {
    expect(shipped.replace(MARKED, '')).toBe(renamed(vendored))
  })

  test('the marked blocks are the --harness flag and nothing else: three of them, none that touches the matching', () => {
    const blocks = shipped.match(MARKED) ?? []
    expect(blocks).toHaveLength(3)
    expect(blocks.join('')).not.toMatch(/\b(grep|sed|tr|case|readonly_cmd)\b/)
    expect(blocks.filter((block) => block.includes('--harness'))).toHaveLength(2)
  })

  test('nothing of the old names is left in the kit that ships', () => {
    for (const file of ['.claude/hooks/es-guard.sh', '.claude/output-styles/enginespace-socratic.md', '.claude/settings.json', 'AGENTS.md', 'README.md']) {
      const text = readFileSync(path.join(project, file), 'utf8')
      expect([file, text.match(/kernelspace|ks-guard|KS_SOLO|ks_done/gi)]).toEqual([file, null])
    }
  })

  test('the shipped hook is the file in labs/agent-kit, byte for byte, and runs under sh as a script', () => {
    expect(shipped).toBe(read('labs/agent-kit/hooks/es-guard.sh'))
    expect(spawnSync('sh', ['-n', path.join(project, '.claude/hooks/es-guard.sh')]).status).toBe(0)
  })
})
