/*
 * W2-T02's static facts about the Python package labs/grader, held from the TypeScript side, where no Python and no uv are needed (the tests job of
 * ci.yml has neither). The package's own behaviour is held by its unittest suite, which labs.yml runs: labs/grader/tests, started with
 * `uv run --project labs/grader python -m unittest`.
 *
 *   - That command, started from the root of the repository as uv runs it, finds the suite only because labs/, labs/grader/ and labs/grader/tests/ are
 *     packages, so the three files that make them are held in place.
 *   - pyproject.toml, uv.lock and ARCHITECTURE §14 agree on the pins (uv_build 0.10.2 and jsonschema 4.26.0, TRACKER's), the lock has the hash of every
 *     file it names, a dependency is exact, and no licence is claimed for enginespace's own code (O-3, D-060).
 *   - The command table of cli.py has the commands of A§9.4 that this task builds, and the README says how to run the suite.
 *   - Nothing in the package names a place on a machine.
 *   - The hash that a receipt's `grader.sourceSha256` holds (ASSESSMENT §5.5) is computed here too, as a reference for the packer (W2-T10): the same
 *     two-file tree gives the same hash in labs/grader/tests/test_identity.py.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { between, read, root, tableRows } from '../ci/support'

const GRADER = 'labs/grader'
const PACKAGE = `${GRADER}/src/enginespace_grader`

/** The files under a folder, as paths from it with `/` between the parts, sorted by the UTF-8 bytes of the path. */
function filesUnder(folder: string): string[] {
  const found: string[] = []
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(root, folder, relative), { withFileTypes: true })) {
      const next = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== '__pycache__' && entry.name !== '.venv') walk(next)
      } else if (entry.isFile()) found.push(next)
    }
  }
  walk('')
  return found.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
}

describe('the unittest chain', () => {
  test('labs/, labs/grader/ and labs/grader/tests/ are packages, so that `python -m unittest` from the root of the repository finds the suite', () => {
    for (const file of ['labs/__init__.py', `${GRADER}/__init__.py`, `${GRADER}/tests/__init__.py`]) expect([file, existsSync(path.join(root, file))]).toEqual([file, true])
  })

  test('the test files are named test_*.py, which is the pattern unittest looks for, and there are many', () => {
    const tests = filesUnder(`${GRADER}/tests`).filter((file) => /^test_[a-z0-9_]+\.py$/.test(file))
    expect(tests.length).toBeGreaterThanOrEqual(15)
    for (const name of ['rng', 'subseed', 'challenge', 'canonical', 'hashing', 'receipt', 'bundle', 'verify', 'grade', 'labs', 'cli', 'identity', 'schemas', 'selftest', 'discovery', 'fetch']) {
      expect(tests).toContain(`test_${name}.py`)
    }
  })

  test('the suite reads each of the five vector files that TypeScript writes (D-030), and the vectors are where it looks for them', () => {
    const readers: Record<string, string> = { rng: 'test_rng.py', subseed: 'test_subseed.py', challenge: 'test_challenge.py', canonical: 'test_canonical.py', sha256: 'test_hashing.py' }
    for (const [vectors, test] of Object.entries(readers)) {
      expect(existsSync(path.join(root, 'schemas/vectors', `${vectors}.json`))).toBe(true)
      expect(read(`${GRADER}/tests/${test}`)).toMatch(new RegExp(`run_vectors\\(\\s*self,\\s*"${vectors}"`))
    }
  })

  test('a checkout does not change a line ending of the package, because the grader\'s hash is over its bytes', () => {
    expect(read(`${GRADER}/.gitattributes`)).toMatch(/^\* text=auto eol=lf$/m)
    for (const file of filesUnder(PACKAGE).filter((name) => /\.(py|json)$/.test(name))) expect([file, read(`${PACKAGE}/${file}`).includes('\r')]).toEqual([file, false])
  })

  test('the interpreter, uv and the editor leave nothing in git: the folder has a .gitignore for the environment and the bytecode', () => {
    const ignore = read(`${GRADER}/.gitignore`)
    for (const entry of ['.venv/', '__pycache__/', '*.py[cod]', 'dist/']) expect(ignore).toContain(entry)
    expect(read('labs/.gitignore')).toContain('__pycache__/')
  })
})

describe('pyproject.toml, uv.lock and the architecture agree on the pins', () => {
  const pyproject = read(`${GRADER}/pyproject.toml`)
  const lock = read(`${GRADER}/uv.lock`)
  const code = pyproject.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n')
  const pins = new Map(
    tableRows(between(read('docs/ARCHITECTURE.md'), '**Python** (grader core', '**Rust:**')).map(([name, version]) => [name.replaceAll('`', '').replace('build backend ', ''), version.split(' ')[0]] as const),
  )

  test('ARCHITECTURE §14 pins jsonschema 4.26.0 and uv_build 0.10.2, which are TRACKER\'s pins', () => {
    expect(pins.get('jsonschema')).toBe('4.26.0')
    expect(pins.get('uv_build')).toBe('0.10.2')
    const task = read('docs/TRACKER.md').match(/W2-T02 · Grader core[\s\S]*?- \*\*Goal:\*\* The `labs\/grader` package \(([^)]*)\)/)?.[1]
    expect(task).toBe('`uv_build==0.10.2`, `jsonschema==4.26.0`')
  })

  test('the project is the enginespace-grader package, which installs the command `enginespace`, and builds with the pinned backend', () => {
    expect(code).toMatch(/^name = "enginespace-grader"$/m)
    expect(code).toMatch(/^version = "\d+\.\d+\.\d+"$/m)
    expect(code).toMatch(/^enginespace = "enginespace_grader\.cli:main"$/m)
    expect(code).toContain('requires = ["uv_build==0.10.2"]')
    expect(code).toContain('build-backend = "uv_build"')
    expect(code).toMatch(/^readme = "README\.md"$/m)
  })

  test('the one dependency is jsonschema, exact, and the range of Python is vLLM\'s, as ARCHITECTURE §9.3 says', () => {
    expect(code).toMatch(/^dependencies = \["jsonschema==4\.26\.0"\]$/m)
    expect(code).toMatch(/^requires-python = ">=3\.11,<3\.15"$/m)
    expect(read('docs/ARCHITECTURE.md')).toContain('the grader declares `>=3.11,<3.15`')
    for (const bad of ['^', '~=', '>=', '~', '*']) {
      const specs = [...code.matchAll(/(?:dependencies|requires) = \[([^\]]*)\]/g)].flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((spec) => spec[1]))
      expect(specs.filter((spec) => spec.includes(bad))).toEqual([])
    }
  })

  test('it claims no licence for enginespace\'s own code (O-3, D-060), and says why in a comment', () => {
    expect(code).not.toMatch(/^\s*license/m)
    expect(code).not.toMatch(/License ::/i)
    expect(code).not.toMatch(/\b(MIT|Apache|GPL|BSD|SPDX)\b/)
    expect(pyproject).toMatch(/no `license` field and no licence file, on purpose/)
    expect(pyproject).toContain('O-3, D-060')
    expect(existsSync(path.join(root, GRADER, 'LICENSE'))).toBe(false)
    expect(code).toContain('"Private :: Do Not Upload"')
  })

  test('uv.lock covers the same range of Python, locks jsonschema 4.26.0 and the project itself as an editable path, and nothing else is a path', () => {
    expect(lock).toMatch(/^requires-python = ">=3\.11, <3\.15"$/m)
    expect(lock).toMatch(/\[\[package\]\]\nname = "jsonschema"\nversion = "4\.26\.0"\nsource = \{ registry = "https:\/\/pypi\.org\/simple" \}/)
    expect(lock).toContain('requires-dist = [{ name = "jsonschema", specifier = "==4.26.0" }]')
    expect(lock).toMatch(/\[\[package\]\]\nname = "enginespace-grader"\nversion = "[^"]+"\nsource = \{ editable = "\." \}/)
    const sources = [...lock.matchAll(/^source = (.*)$/gm)].map((match) => match[1])
    expect(sources.filter((source) => source !== '{ registry = "https://pypi.org/simple" }' && source !== '{ editable = "." }')).toEqual([])
  })

  test('every file the lock names has its SHA-256, so `uv sync --locked` installs exactly what was locked', () => {
    const named = [...lock.matchAll(/^(?:sdist = |\s+)\{ url = "[^"]+"/gm)].length
    const hashed = [...lock.matchAll(/\{ url = "https:\/\/files\.pythonhosted\.org\/[^"]+", hash = "sha256:[0-9a-f]{64}"/g)].length
    expect(named).toBeGreaterThan(10)
    expect(hashed).toBe(named)
    const packages = [...lock.matchAll(/^name = "([^"]+)"$/gm)].map((match) => match[1]).sort()
    expect(packages).toEqual(['attrs', 'enginespace-grader', 'jsonschema', 'jsonschema-specifications', 'referencing', 'rpds-py', 'typing-extensions'])
  })

  test('the lock holds no local path, host name or user name', () => {
    expect(lock).not.toMatch(/file:\/\/|\/home\/|\/tmp\/|\/Users\//)
  })
})

describe('the commands', () => {
  const cli = read(`${PACKAGE}/cli.py`)
  const table = tableRows(between(read('docs/ARCHITECTURE.md'), '### 9.4 Commands', '### 9.5'))
    .map(([command]) => command.replaceAll('`', ''))
    .map((command) => command.replace(/^enginespace /, ''))

  test('ARCHITECTURE §9.4 names the six commands, and cli.py has the five that W2-T02 and W2-T05 build, and `version`, which prints the hash that the packer needs', () => {
    expect(table.map((command) => command.split(' ')[0])).toEqual(['doctor', 'fetch', 'grade', 'receipt', 'trace', 'selftest'])
    const commands = [...cli.matchAll(/^ {4}"([a-z]+)": \(_[a-z]+, /gm)].map((match) => match[1])
    expect(commands).toEqual(['doctor', 'fetch', 'grade', 'receipt', 'selftest', 'version'])
    // `trace export` is W2-T19's, and the docstring says so.
    expect(cli).toContain('`trace export` (W2-T19) joins the table with its task')
  })

  test('the command is installed as `enginespace` and the receipt command has its verify subcommand', () => {
    expect(read(`${PACKAGE}/__main__.py`)).toContain('from .cli import main')
    expect(cli).toContain('prog="enginespace receipt"')
    expect(cli).toContain('"verify"')
  })

  test('the packaged files are the ones the build ships: the code, the five schemas and nothing from the tests', () => {
    const files = filesUnder(PACKAGE)
    expect(files.filter((file) => file.endsWith('.py')).length).toBeGreaterThanOrEqual(15)
    expect(files.filter((file) => file.startsWith('schemas/'))).toEqual([
      'schemas/bundle.schema.json',
      'schemas/challenge.schema.json',
      'schemas/receipt.schema.json',
      'schemas/references.schema.json',
      'schemas/trace.schema.json',
    ])
    expect(files.filter((file) => !/\.(py|json)$/.test(file))).toEqual([])
    expect(files.filter((file) => file.startsWith('tests/') || file.includes('test_'))).toEqual([])
  })
})

describe('the package names no place on a machine', () => {
  const files = [...filesUnder(GRADER).filter((file) => /\.(py|toml|md|lock)$/.test(file) && !file.startsWith('.venv'))]

  test('no file holds a home folder, a scratch folder or a host name of a person', () => {
    expect(files.length).toBeGreaterThan(30)
    for (const file of files) {
      const text = read(`${GRADER}/${file}`)
      // The needles are built from pieces, so that this file does not hold them either.
      for (const needle of [['/ho', 'me/'], ['/Us', 'ers/'], ['/tm', 'p/claude'], ['C:', '\\\\Users']].map((pieces) => pieces.join(''))) {
        expect([file, text.includes(needle)]).toEqual([file, false])
      }
    }
  })

  test('the tests build their machine from invented values: a host kind and an invented operating system, and no real host name', () => {
    const samples = read(`${GRADER}/tests/samples.py`)
    expect(samples).toContain('Example Linux 1.0')
    expect(samples).toContain('Example GPU 24GB')
    expect(samples).toContain('No machine ran it')
  })
})

describe('what leaves the machine (ARCHITECTURE §9.7, ASSESSMENT §5.1; W2-T05)', () => {
  /** An import of a library that can make a network request. */
  const NETWORK = /^\s*(?:import\s+(?:urllib\.request|http\.client|http\.server|socket|ssl|ftplib|smtplib|telnetlib|xmlrpc\.client|requests|httpx|aiohttp|websockets)\b|from\s+(?:urllib\s+import\s+request|urllib\.request|http\.client|http\.server|socket|ssl|ftplib|smtplib|requests|httpx|aiohttp|websockets)\b)/m
  const modules = filesUnder(PACKAGE).filter((file) => file.endsWith('.py'))

  test('no module of the package but fetch.py imports a library that can make a request, so `enginespace fetch` is the one command that downloads anything', () => {
    expect(modules).toContain('fetch.py')
    expect(modules.filter((file) => NETWORK.test(read(`${PACKAGE}/${file}`)))).toEqual(['fetch.py'])
    // The check can fail: it reads each form of an import that it names.
    for (const line of ['import urllib.request', 'from urllib import request', 'import http.client as h', 'from socket import socket', 'import requests', 'from httpx import get']) expect([line, NETWORK.test(line)]).toEqual([line, true])
    for (const line of ['import urllib.parse', 'from urllib.parse import urlsplit', 'import hashlib', 'from .socketry import x']) expect([line, NETWORK.test(line)]).toEqual([line, false])
  })

  test('fetch.py sends the User-Agent that names the program and its version, and reads no token, cookie, user name or host name', () => {
    const code = read(`${PACKAGE}/fetch.py`)
    expect(code).toContain('return f"{GRADER_NAME}/{__version__}"')
    expect(code).toContain('headers = {"User-Agent": user_agent(), "Accept-Encoding": "identity"}')
    expect(read(`${PACKAGE}/__init__.py`)).toContain('GRADER_NAME = "enginespace-grader"')
    for (const needle of [/environ\.get\(\s*["'](?:HF_|HUGGING)/, /getenv\(\s*["'](?:HF_|HUGGING)/, /["'](?:Authorization|Cookie|Referer|X-[A-Za-z-]+)["']/, /getpass|gethostname|platform\.node|getlogin|\bUSER\b/]) {
      expect([needle.source, needle.test(code)]).toEqual([needle.source, false])
    }
  })
})

describe('the hash of the grader (ASSESSMENT §5.5), computed here as the packer will compute it', () => {
  /** For each file, in the order of the UTF-8 bytes of its path: the path, a NUL, the length in decimal, a NUL, the bytes. The SHA-256 of all of that. */
  function sourceSha256(files: ReadonlyMap<string, Uint8Array>): string {
    const digest = createHash('sha256')
    for (const name of [...files.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
      const data = files.get(name) as Uint8Array
      digest.update(Buffer.from(`${name}\u0000${data.length}\u0000`))
      digest.update(data)
    }
    return digest.digest('hex')
  }

  test('a tree of two files gives the hash that labs/grader/tests/test_identity.py pins', () => {
    const tree = new Map([
      ['a.py', Buffer.from('x = 1\n')],
      ['sub/b.json', Buffer.from('{}\n')],
    ])
    expect(sourceSha256(tree)).toBe('50069fac86bd12150588ceda87cdd5a5b277a568fa976176ff001f839b3ff73d')
    expect(read(`${GRADER}/tests/test_identity.py`)).toContain('50069fac86bd12150588ceda87cdd5a5b277a568fa976176ff001f839b3ff73d')
  })

  test('the package on disk has a hash, which is the same whatever the order its files were read in, and moves with one byte', () => {
    const names = filesUnder(PACKAGE).filter((file) => !file.startsWith('.') && !file.endsWith('.pyc'))
    const tree = new Map(names.map((name) => [name, readFileSync(path.join(root, PACKAGE, name))] as const))
    const hash = sourceSha256(tree)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(sourceSha256(new Map([...tree].reverse()))).toBe(hash)
    const changed = new Map(tree)
    const first = names[0]
    changed.set(first, Buffer.concat([tree.get(first) as Buffer, Buffer.from(' ')]))
    expect(sourceSha256(changed)).not.toBe(hash)
    expect(statSync(path.join(root, PACKAGE)).isDirectory()).toBe(true)
  })
})
