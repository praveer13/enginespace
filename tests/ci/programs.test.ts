/*
 * The programs that the Playwright specs start against the programs that the CI jobs running them install (tests/ci/programs.ts has the
 * reader and says what it cannot see). e2e/front.spec.ts called `bun` while the e2e-features job installed none, and every machine that
 * the work was checked on has Bun, so only the pull request's CI failed. This test fails on such a machine too.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { closureOf, missingPrograms, programsStarted, projectOf, relativeImports, runnersOf, runs, specFiles, webServerPrograms } from './programs'
import { read, root } from './support'

const directory = '.github/workflows'
const workflows = new Map(
  readdirSync(path.join(root, directory))
    .filter((file) => file.endsWith('.yml'))
    .sort()
    .map((file) => [file, read(`${directory}/${file}`)] as const),
)
const config = read('playwright.config.ts')

/** A workflow with one Playwright job: Node, optionally Bun, and the command. */
const workflow = (run: string, bun: boolean, env = ''): ReadonlyMap<string, string> =>
  new Map([
    [
      'x.yml',
      `jobs:
  job:
    runs-on: ubuntu-latest
${env}    steps:
      - uses: actions/setup-node@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
${bun ? '      - uses: oven-sh/setup-bun@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' : ''}      - run: ${run}
`,
    ],
  ])

describe('the programs that the specs start', () => {
  test('every program that a spec, a helper it imports or the config starts is installed by every job that runs it', () => {
    expect(specFiles().length).toBeGreaterThan(40)
    expect(missingPrograms({ specs: specFiles(), config, workflows })).toEqual([])
  })

  test('the reader sees what the repository starts today: bun in front.spec.ts, git in perf.spec.ts, sh in lab-kits.spec.ts, and bun only behind the sweep switch in the config', () => {
    const of = (spec: string) => closureOf(spec).flatMap((file) => programsStarted(read(file)).programs)
    expect(of('e2e/front.spec.ts')).toContain('bun')
    expect(of('e2e/perf.spec.ts')).toContain('git')
    expect(of('e2e/lab-kits.spec.ts')).toContain('sh')
    expect(webServerPrograms(config)).toEqual({ always: ['npm', 'npx'], sweep: ['bun'] })
    expect(projectOf('e2e/front.spec.ts', config)).toBe('features')
    expect(projectOf('e2e/walks.spec.ts', config)).toBe('smoke')
    expect(projectOf('e2e/perf.spec.ts', config)).toBe('lab')
    // The jobs: e2e-features runs front.spec.ts and has Bun; the lab-profile job runs perf.spec.ts alone.
    const runners = runnersOf(workflows)
    const front = runners.filter((runner) => runs(runner, 'e2e/front.spec.ts', 'features')).map((runner) => runner.at)
    expect(front).toEqual(expect.arrayContaining(['ci.yml/e2e-features', 'nightly.yml/browsers']))
    expect(front).not.toContain('ci.yml/e2e-smoke')
    expect(runners.filter((runner) => runs(runner, 'e2e/perf.spec.ts', 'lab')).map((runner) => runner.at)).toContain('nightly.yml/lab-profile')
  })

  test('no call in a spec or a helper takes its program from a variable, where this test cannot read it', () => {
    const dynamic = specFiles().flatMap((spec) => closureOf(spec).flatMap((file) => (programsStarted(read(file)).dynamic > 0 ? [file] : [])))
    expect([...new Set(dynamic)]).toEqual([])
  })

  test('it can fail: front.spec.ts as it stood (a bun call) against a job with Node and no Bun', () => {
    const spec = `import { execFileSync } from 'node:child_process'\nexecFileSync('bun', ['scripts/prepare-pages.ts'])\n`
    const args = { specs: ['e2e/front.spec.ts'], config, readSource: (file: string) => (file === 'e2e/front.spec.ts' ? spec : read(file)) }
    const run = 'npx playwright test --project=features --shard="$SHARD/4"'
    expect(missingPrograms({ ...args, workflows: workflow(run, false) })).toEqual(['e2e/front.spec.ts (features) starts "bun" in e2e/front.spec.ts, and x.yml/job does not install it'])
    expect(missingPrograms({ ...args, workflows: workflow(run, true) })).toEqual([])
    // The same job in another project does not run the spec, so it owes nothing.
    expect(missingPrograms({ ...args, workflows: workflow('npx playwright test --project=smoke', false) })).toEqual([])
  })

  test('it can fail: a program that no job installs, found through an import, an alias, a namespace and Bun.spawn', () => {
    const sources: Record<string, string> = {
      'e2e/a.spec.ts': `import { helper } from './support/h'\n`,
      'e2e/support/h.ts': `import { spawnSync as run } from 'node:child_process'\nrun('tmux', ['new'])\n`,
      'e2e/b.spec.ts': `import * as cp from 'child_process'\ncp.execSync('cargo build --offline')\n`,
      'e2e/c.spec.ts': `Bun.spawn(['ffmpeg', '-i', 'x'])\n`,
    }
    const found = (spec: string) =>
      missingPrograms({
        specs: [spec],
        config,
        workflows: workflow('npx playwright test --project=features', true),
        readSource: (file) => sources[file] ?? read(file),
      })
    // Only closureOf resolves files that exist, so an import that is not on disk is not followed: the helper is read by name here.
    expect(programsStarted(sources['e2e/support/h.ts']).programs).toEqual(['tmux'])
    expect(programsStarted(sources['e2e/b.spec.ts']).programs).toEqual(['cargo'])
    expect(found('e2e/b.spec.ts')).toEqual(['e2e/b.spec.ts (features) starts "cargo" in e2e/b.spec.ts, and x.yml/job does not install it'])
    expect(programsStarted(sources['e2e/c.spec.ts']).programs).toEqual(['ffmpeg'])
    expect(found('e2e/c.spec.ts')).toHaveLength(1)
    expect(relativeImports(sources['e2e/a.spec.ts'])).toEqual(['./support/h'])
  })

  test('it reads a command line by its first word, ignores comments and regular expressions, and counts a program taken from a variable', () => {
    expect(programsStarted(`import { execSync } from 'node:child_process'\nexecSync('git rev-parse HEAD')\n// execSync('nope')\n/* execFileSync('nope') */\nconst m = /a/.exec('a')\n`).programs).toEqual(['git'])
    const dynamic = programsStarted(`import { execFileSync } from 'node:child_process'\nexecFileSync(program, [])\nexecFileSync(\`\${dir}/tool\`, [])\n`)
    expect(dynamic).toEqual({ programs: [], dynamic: 2 })
    expect(programsStarted(`const x = 'bun'\nx.exec('bun')\n`).programs).toEqual([])
  })

  test('the config\'s webServer needs bun only on a run that sets the nightly or the Pages switch, and a job that sets it without bun fails', () => {
    const nightly = workflow('npx playwright test', false, '    env:\n      ES_E2E_NIGHTLY: \'1\'\n')
    expect(missingPrograms({ specs: [], config, workflows: nightly })).toEqual(['playwright.config.ts\'s webServer starts "bun", and x.yml/job does not install it'])
    expect(missingPrograms({ specs: [], config, workflows: workflow('npx playwright test', false) })).toEqual([])
    expect(missingPrograms({ specs: [], config, workflows: workflow('npx playwright test', true, '    env:\n      ES_E2E_NIGHTLY: \'1\'\n') })).toEqual([])
  })
})
