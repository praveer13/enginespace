/*
 * W1-T10: how verify:labs finds the compiler (scripts/labs/toolchain.ts). The gate must build with exactly the pinned Rust and must not
 * fetch anything, so these tests give it a machine that is described, not a real one: a rustup that holds a 1.96.0 without the wasm32
 * target beside a `stable` that is the same compiler and has it, which is the machine that the first run of the gate was made on.
 * That `stable` also holds rust-src, which put the machine's own paths into the first committed builds, and cargo, which knows a
 * compiler only by `rustc -vV`, then served its cached builds to the 1.96.0 beside it. The last tests hold both off.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { NoToolchain, parsePin, resolveToolchain } from '../../scripts/labs/toolchain'

const scratch = mkdtempSync(path.join(tmpdir(), 'es-toolchain-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const forge = path.join(scratch, 'forge')
mkdirSync(forge)
writeFileSync(path.join(forge, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.96.0"\nprofile = "minimal"\ntargets = ["wasm32-unknown-unknown"]\n')

/** A libdir that holds the wasm32 standard library, or one that does not. */
const withTarget = path.join(scratch, 'has-wasm32')
const withoutTarget = path.join(scratch, 'no-wasm32')
mkdirSync(withTarget)
mkdirSync(withoutTarget)
writeFileSync(path.join(withTarget, 'libcore-0123456789abcdef.rlib'), '')

/** A sysroot that holds the rust-src component, and one that does not. */
const withSrc = path.join(scratch, 'sysroot-with-src')
const withoutSrc = path.join(scratch, 'sysroot')
mkdirSync(path.join(withSrc, 'lib', 'rustlib', 'src', 'rust'), { recursive: true })
const HASH = 'ac68faa20c58cbccd01ee7208bf3b6e93a7d7f96'
/** The flag that cargo gets for a toolchain with this sysroot. */
const remap = (sysroot: string) => `--remap-path-prefix=${path.join(sysroot, 'lib', 'rustlib', 'src', 'rust')}=/rustc/${HASH}`

interface Toolchain {
  version: string
  wasm: boolean
  /** The sysroot, when it holds rust-src. */
  sysroot?: string
}

/** A machine: the toolchain that rustup picks for labs/forge (`file`), and the others it holds by name. */
function machine(file: Toolchain, others: Record<string, Toolchain>) {
  const calls: string[] = []
  const spawn = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
    const name = options.env.RUSTUP_TOOLCHAIN
    const chosen = name === undefined ? file : others[name]
    calls.push(`${command} ${args.join(' ')} [${name ?? 'file'}]`)
    if (command === 'rustup') return { status: 0, stdout: Object.keys(others).map((n) => `${n}${n === 'stable' ? ' (active, default)' : ''}`).join('\n') + '\n' }
    if (chosen === undefined) return { status: 1, stdout: '' }
    if (args[0] === '--version') return { status: 0, stdout: `rustc ${chosen.version} (ac68faa20 2026-05-25)\n` }
    if (args[0] === '-vV') return { status: 0, stdout: `rustc ${chosen.version} (ac68faa20 2026-05-25)\nbinary: rustc\ncommit-hash: ${HASH}\nrelease: ${chosen.version}\n` }
    if (args[1] === 'sysroot') return { status: 0, stdout: `${chosen.sysroot ?? withoutSrc}\n` }
    return { status: 0, stdout: `${chosen.wasm ? withTarget : withoutTarget}\n` }
  }
  return { spawn, calls }
}

describe('the pin', () => {
  test('is the channel and the targets of rust-toolchain.toml', () => {
    expect(parsePin('[toolchain]\nchannel = "1.96.0"\nprofile = "minimal"\ntargets = ["wasm32-unknown-unknown"]\n')).toEqual({ channel: '1.96.0', targets: ['wasm32-unknown-unknown'] })
    expect(parsePin('[toolchain]\nchannel = "stable"\n')).toEqual({ channel: 'stable', targets: [] })
    expect(() => parsePin('[toolchain]\n')).toThrow('no channel')
  })
})

describe('finding the compiler', () => {
  test('the toolchain that rustup picks for the folder is taken when it is the pinned version with the wasm32 target, and nothing is overridden', () => {
    const { spawn } = machine({ version: '1.96.0', wasm: true }, { stable: { version: '1.96.0', wasm: true } })
    const found = resolveToolchain(forge, { PATH: 'p' }, spawn)
    expect(found.name).toBeNull()
    expect(found.rustc).toContain('rustc 1.96.0 ')
    expect(found.env).toEqual({ PATH: 'p', CARGO_ENCODED_RUSTFLAGS: remap(withoutSrc) })
  })

  test('a pinned version that lacks the target is passed over for another toolchain of the same version that has it, which is then named', () => {
    const { spawn } = machine({ version: '1.96.0', wasm: false }, { '1.96.0-x86_64-unknown-linux-gnu': { version: '1.96.0', wasm: false }, stable: { version: '1.96.0', wasm: true } })
    const found = resolveToolchain(forge, { PATH: 'p' }, spawn)
    expect(found.name).toBe('stable')
    expect(found.env).toEqual({ PATH: 'p', RUSTUP_TOOLCHAIN: 'stable', CARGO_ENCODED_RUSTFLAGS: remap(withoutSrc) })
  })

  test('looking never downloads: every probe runs with RUSTUP_AUTO_INSTALL=0', () => {
    const seen: (string | undefined)[] = []
    const spawn = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      seen.push(options.env.RUSTUP_AUTO_INSTALL)
      return machine({ version: '1.96.0', wasm: true }, {}).spawn(command, args, options)
    }
    resolveToolchain(forge, {}, spawn)
    expect(seen.length).toBeGreaterThan(0)
    expect(new Set(seen)).toEqual(new Set(['0']))
  })

  test('a toolchain of another version is never taken, even when it has the target', () => {
    const { spawn } = machine({ version: '1.95.0', wasm: true }, { nightly: { version: '1.99.0-nightly', wasm: true }, stable: { version: '1.97.0', wasm: true } })
    expect(() => resolveToolchain(forge, {}, spawn)).toThrow(NoToolchain)
    try {
      resolveToolchain(forge, {}, spawn)
    } catch (e) {
      expect((e as NoToolchain).missing).toBe(false)
      expect((e as NoToolchain).message).toContain('rustup toolchain install 1.96.0 --profile minimal --target wasm32-unknown-unknown')
    }
  })

  test('a machine with no Rust at all says so, so that the gate can skip off a runner', () => {
    const spawn = () => ({ status: null, stdout: '', error: new Error('spawn rustc ENOENT') })
    try {
      resolveToolchain(forge, {}, spawn)
      throw new Error('it found one')
    } catch (e) {
      expect(e).toBeInstanceOf(NoToolchain)
      expect((e as NoToolchain).missing).toBe(true)
    }
  })
})

describe('the bytes', () => {
  test('a toolchain that holds rust-src builds as one without it does: cargo maps the local source back to /rustc/<commit-hash>', () => {
    const { spawn } = machine({ version: '1.96.0', wasm: false }, { stable: { version: '1.96.0', wasm: true, sysroot: withSrc } })
    expect(resolveToolchain(forge, { PATH: 'p' }, spawn).env).toEqual({ PATH: 'p', RUSTUP_TOOLCHAIN: 'stable', CARGO_ENCODED_RUSTFLAGS: remap(withSrc) })
  })

  test('a toolchain without rust-src gets the flag as well: it changes no byte there, and it names the sysroot, so that cargo never serves the cached build of one toolchain to another of the same version', () => {
    const pinned = machine({ version: '1.96.0', wasm: true }, {})
    const named = machine({ version: '1.96.0', wasm: false }, { stable: { version: '1.96.0', wasm: true, sysroot: withSrc } })
    const flags = [pinned, named].map(({ spawn }) => resolveToolchain(forge, {}, spawn).env.CARGO_ENCODED_RUSTFLAGS)
    expect(flags).toEqual([remap(withoutSrc), remap(withSrc)])
  })

  test('flags that the caller set stay, and the remap joins them', () => {
    const { spawn } = machine({ version: '1.96.0', wasm: true, sysroot: withSrc }, {})
    expect(resolveToolchain(forge, { RUSTFLAGS: ' -C  debug-assertions ' }, spawn).env.CARGO_ENCODED_RUSTFLAGS).toBe(`-C\x1fdebug-assertions\x1f${remap(withSrc)}`)
    expect(resolveToolchain(forge, { CARGO_ENCODED_RUSTFLAGS: '--cfg\x1fa b' }, spawn).env.CARGO_ENCODED_RUSTFLAGS).toBe(`--cfg\x1fa b\x1f${remap(withSrc)}`)
  })

  test('the committed builds carry no path of the machine that made them: no home directory, no rustup or cargo folder, no local rust-src', () => {
    const fixtures = path.resolve(import.meta.dirname, '../fixtures/forge')
    const marks = ['/home/', '/Users/', '/root/', '\\Users\\', '/.rustup/', '/.cargo/', 'lib/rustlib/src/rust']
    const builds = readdirSync(fixtures, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.wasm'))
    expect(builds.length).toBeGreaterThan(0)
    const found = builds.flatMap((file) => {
      const text = readFileSync(path.join(fixtures, file)).toString('latin1')
      return marks.filter((mark) => text.includes(mark)).map((mark) => `${file}: ${mark}`)
    })
    expect(found).toEqual([])
  })
})
