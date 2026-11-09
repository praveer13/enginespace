/*
 * Which Rust builds the forge labs (ARCHITECTURE §10.3: Rust 1.96.0 with the wasm32 target).
 *
 * labs/forge/rust-toolchain.toml pins the compiler, and rustup honours it for a cargo that runs inside labs/forge. That is the whole
 * story on a runner (labs.yml installs the toolchain with its target) and on a learner's laptop. A developer's machine can differ:
 * rustup may hold a toolchain of exactly that version that has no wasm32 target, and a second one, such as `stable`, that is the same
 * compiler and has it. Naming the toolchain in the file makes rustup try to fetch the missing target on the first use, which a gate
 * must never do, so the gate looks before it builds.
 *
 *   1. The toolchain that rustup picks for labs/forge (RUSTUP_AUTO_INSTALL=0: looking never downloads).
 *   2. Any other installed toolchain.
 *
 * A candidate is taken when `rustc --version` names the pinned version exactly and the wasm32 standard library is installed for it.
 * The compiler is never a different version from the pin: only the name rustup knows it by can differ.
 *
 * The bytes do not depend on the machine either. With the rust-src component installed, rustc reads the standard library from
 * <sysroot>/lib/rustlib/src/rust instead of by its /rustc/<commit-hash> name, and the panic locations it compiles into a module then
 * carry that local path: the builder's home directory, in bytes unlike a build made without the component (labs.yml installs the
 * minimal profile, which has none). So cargo gets a --remap-path-prefix that maps that path back to /rustc/<commit-hash>, and gets it
 * whether or not rust-src is there. Without rust-src the flag changes no byte, but it names the sysroot, and cargo's fingerprint needs
 * that: it knows a compiler only by `rustc -vV`, which two toolchains of one version share, so a target dir would hand one's build to
 * the other [measured 2026-11-04: `stable` with rust-src and `1.96.0` without it build the toy identically with the flag and
 * differently without it, and a target dir that `stable` had built served its stale modules to `1.96.0` until the flag was there].
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export interface Pin {
  /** `1.96.0`. */
  channel: string
  targets: string[]
}

/** The pin in a rust-toolchain.toml: its `channel` and its `targets`. */
export function parsePin(text: string): Pin {
  const channel = /^\s*channel\s*=\s*"([^"]+)"/m.exec(text)?.[1]
  if (channel === undefined) throw new Error('rust-toolchain.toml names no channel')
  const list = /^\s*targets\s*=\s*\[([^\]]*)\]/m.exec(text)?.[1] ?? ''
  return { channel, targets: [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]) }
}

export interface Toolchain {
  /**
   * The environment to give cargo: the process's own, with RUSTUP_TOOLCHAIN set when the pin is met by a toolchain that rustup would not
   * pick, and CARGO_ENCODED_RUSTFLAGS carrying the remap of that toolchain's rust-src path.
   */
  env: NodeJS.ProcessEnv
  /** `rustc --version`, exactly as the build sees it. */
  rustc: string
  /** The rustup toolchain that builds, or null when rustup picks it from the file. */
  name: string | null
  pin: Pin
}

/** Thrown when no installed Rust meets the pin. `missing` is true when there is no Rust on this machine at all. */
export class NoToolchain extends Error {
  readonly missing: boolean
  constructor(message: string, missing: boolean) {
    super(message)
    this.name = 'NoToolchain'
    this.missing = missing
  }
}

type Spawn = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => { status: number | null; stdout: string; error?: Error }

const realSpawn: Spawn = (command, args, options) => {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout ?? '', error: result.error }
}

/** Whether the wasm32 standard library of the target is installed for the compiler that `env` selects. */
function hasTarget(spawn: Spawn, cwd: string, env: NodeJS.ProcessEnv, target: string): boolean {
  const libdir = spawn('rustc', ['--print', 'target-libdir', '--target', target], { cwd, env })
  if (libdir.status !== 0) return false
  const dir = libdir.stdout.trim()
  return dir !== '' && existsSync(dir) && readdirSync(dir).some((file) => file.startsWith('libcore-'))
}

/**
 * The flag that keeps a local rust-src out of the bytes, given whether or not rust-src is installed (see the top of this file), or none
 * when rustc does not say its sysroot and commit.
 */
function rustSrcRemap(spawn: Spawn, cwd: string, env: NodeJS.ProcessEnv): string[] {
  const sysroot = spawn('rustc', ['--print', 'sysroot'], { cwd, env }).stdout.trim()
  const hash = /^commit-hash: ([0-9a-f]{40})$/m.exec(spawn('rustc', ['-vV'], { cwd, env }).stdout)?.[1]
  return sysroot !== '' && hash !== undefined ? [`--remap-path-prefix=${path.join(sysroot, 'lib', 'rustlib', 'src', 'rust')}=/rustc/${hash}`] : []
}

/**
 * `env` with `flags` added to what cargo passes rustc. Cargo reads CARGO_ENCODED_RUSTFLAGS before RUSTFLAGS, so flags already in
 * RUSTFLAGS move into it, and a path with a space in it stays one argument.
 */
function withFlags(env: NodeJS.ProcessEnv, flags: string[]): NodeJS.ProcessEnv {
  if (flags.length === 0) return env
  const set = env.CARGO_ENCODED_RUSTFLAGS !== undefined ? env.CARGO_ENCODED_RUSTFLAGS.split('\x1f') : (env.RUSTFLAGS ?? '').split(/\s+/)
  return { ...env, CARGO_ENCODED_RUSTFLAGS: [...set.filter((flag) => flag !== ''), ...flags].join('\x1f') }
}

export function resolveToolchain(forgeDir: string, base: NodeJS.ProcessEnv = process.env, spawn: Spawn = realSpawn): Toolchain {
  const pin = parsePin(readFileSync(path.join(forgeDir, 'rust-toolchain.toml'), 'utf8'))
  const looking: NodeJS.ProcessEnv = { ...base, RUSTUP_AUTO_INSTALL: '0' }

  const probe = spawn('rustc', ['--version'], { cwd: forgeDir, env: looking })
  if (probe.error !== undefined || probe.status === null) {
    throw new NoToolchain('no Rust on this machine: install rustup, then `rustup toolchain install ' + pin.channel + ' --profile minimal --target wasm32-unknown-unknown`', true)
  }

  const names = spawn('rustup', ['toolchain', 'list'], { cwd: forgeDir, env: looking })
  const installed = names.status === 0 ? names.stdout.split('\n').map((line) => line.split(/\s+/)[0]).filter((name) => name !== '') : []
  const candidates: (string | null)[] = [null, ...installed]

  const tried: string[] = []
  for (const name of candidates) {
    const env = name === null ? looking : { ...looking, RUSTUP_TOOLCHAIN: name }
    const version = spawn('rustc', ['--version'], { cwd: forgeDir, env })
    const rustc = version.stdout.trim()
    tried.push(`${name ?? 'the one rust-toolchain.toml selects'}: ${version.status === 0 ? rustc : 'not usable'}`)
    if (version.status !== 0 || !rustc.startsWith(`rustc ${pin.channel} `)) continue
    if (!pin.targets.every((target) => hasTarget(spawn, forgeDir, env, target))) continue
    // Cargo gets the process's own environment, so that rustup may do what it does for a learner (install what the file asks), but not
    // when the pin was met by another name: then RUSTUP_TOOLCHAIN overrides the file, and nothing is fetched.
    const own = name === null ? { ...base } : { ...base, RUSTUP_TOOLCHAIN: name }
    return { env: withFlags(own, rustSrcRemap(spawn, forgeDir, env)), rustc, name, pin }
  }
  throw new NoToolchain(
    `no installed Rust is ${pin.channel} with ${pin.targets.join(', ')} (${tried.join('; ')}). Run: rustup toolchain install ${pin.channel} --profile minimal --target ${pin.targets.join(' --target ')}`,
    false,
  )
}
