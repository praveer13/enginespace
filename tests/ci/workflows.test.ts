/*
 * W0-T04's workflows, .github/workflows/*.yml, against ARCHITECTURE §10 and the registry in scripts/verify.ts.
 *
 * A workflow cannot run here, so these tests hold what a run would otherwise show:
 *   - every workflow file parses with js-yaml (acceptance 5), and a duplicate key is an error;
 *   - every action is pinned by full SHA with §10.3's release in the comment, jobs default to `contents: read`, only the
 *     jobs that need more widen it, and every checkout drops its credentials (acceptance 1);
 *   - deploy.yml builds at the root of the custom domain (the default base, D-058) on pushes to main and by hand, behind
 *     PAGES_ENABLED (acceptance 3);
 *   - nightly.yml opens or updates one nightly-failure issue when a job fails (acceptance 4);
 *   - every gate of the registry runs in some workflow, and the fast gate runs them in the order that works: the source
 *     gates, the build, then the gates that read it;
 *   - a step that is reserved for a later task says "pending: <task>", with a task that TRACKER.md has and that has not merged: a
 *     reserved step whose task has landed is a check that nobody built (nightly.yml's `properties` printed W0-T10's for a wave).
 * What these tests cannot see is the syntax of expressions, the contexts they read and the shell in `run`. `actionlint`, with
 * shellcheck on the PATH, checks those over .github/workflows. It is not a dependency, so run it by hand when a workflow changes.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { GATE_NAMES, GATES } from '../../scripts/verify'
import { checkBoundaries } from '../../scripts/verify-boundaries'
import { readersWithoutProducer, SAMPLES, testSources } from './pristine'
import { BUN_FALLBACK, TASK_ID, UV_FALLBACK, backticked, between, ciTestShards, markedTasks, read, root, tableRows, taskHeadings, trackerTasks } from './support'

interface Step {
  name?: string
  id?: string
  'continue-on-error'?: boolean
  uses?: string
  run?: string
  if?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
}
interface Job {
  'runs-on'?: string
  'timeout-minutes'?: number
  needs?: string | string[]
  if?: string
  permissions?: Record<string, string>
  environment?: { name?: string; url?: string }
  env?: Record<string, string>
  strategy?: { 'fail-fast'?: boolean; matrix?: { shard?: number[] } }
  steps?: Step[]
}
interface Workflow {
  name?: string
  on?: Record<string, unknown>
  permissions?: Record<string, string>
  env?: Record<string, string>
  jobs?: Record<string, Job>
}

const directory = '.github/workflows'
const files = readdirSync(path.join(root, directory))
  .filter((file) => file.endsWith('.yml'))
  .sort()
const sources = new Map(files.map((file) => [file, read(`${directory}/${file}`)]))
// js-yaml throws on a duplicate key, so a workflow that parses here has none.
const workflows = new Map(
  files.map((file) => {
    try {
      return [file, load(sources.get(file) ?? '') as Workflow]
    } catch (error) {
      throw new Error(`${directory}/${file} does not parse with js-yaml: ${error instanceof Error ? error.message : String(error)}`)
    }
  }),
)

const workflow = (file: string) => workflows.get(file) as Workflow
const jobsOf = (file: string) => Object.entries(workflow(file).jobs ?? {})
const stepsOf = (file: string, job: string) => workflow(file).jobs?.[job]?.steps ?? []
const runsOf = (file: string, job: string) =>
  stepsOf(file, job).flatMap((step) => (step.run === undefined || step.if === BUN_FALLBACK || step.if === UV_FALLBACK ? [] : [step.run.trim()]))
const allSteps = () => files.flatMap((file) => jobsOf(file).flatMap(([job, { steps = [] }]) => steps.map((step) => ({ file, job, step }))))

/** ARCHITECTURE §10.3: the actions with their SHAs and releases, and the tools with their versions. */
const pins = tableRows(between(read('docs/ARCHITECTURE.md'), '### 10.3 Pinned tools and actions', 'Every job sets'))
const actions = new Map(
  pins
    .filter(([name]) => name.startsWith('`'))
    .map(([name, pin]) => {
      const match = /^`([0-9a-f]{40})` \((v\d+\.\d+\.\d+)\)$/.exec(pin)
      if (!match) throw new Error(`§10.3's pin for ${name} is not "<sha> (<release>)": ${pin}`)
      return [backticked(name)[0], { sha: match[1], release: match[2] }] as const
    }),
)
const tool = (name: string) => /^\d+(\.\d+)*/.exec(pins.find(([cell]) => cell === name)?.[1] ?? '')?.[0]

describe('the workflow files', () => {
  test('include the four that W0-T04 owns', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'deploy.yml', 'labs.yml', 'nightly.yml']))
  })

  test('each parse with js-yaml into a named workflow with triggers and jobs', () => {
    for (const file of files) {
      const parsed = workflow(file)
      expect([file, typeof parsed.name]).toEqual([file, 'string'])
      expect([file, Object.keys(parsed.on ?? {}).length > 0]).toEqual([file, true])
      expect([file, jobsOf(file).length > 0]).toEqual([file, true])
    }
  })

  test('every job has a runner and a timeout', () => {
    for (const file of files) {
      for (const [name, job] of jobsOf(file)) {
        expect([file, name, typeof job['runs-on'], typeof job['timeout-minutes']]).toEqual([file, name, 'string', 'number'])
      }
    }
  })

  test('none uses pull_request_target, which would run a fork\'s code with the repository\'s token', () => {
    for (const file of files) expect(Object.keys(workflow(file).on ?? {})).not.toContain('pull_request_target')
  })

  test('none pastes an expression into a script: values reach `run` through `env`', () => {
    // A ${{ }} inside `run` is substituted before the shell parses it, so whoever controls the value controls the script.
    const pasted = files.flatMap((file) => jobsOf(file).flatMap(([job]) => runsOf(file, job).filter((run) => run.includes('${{')).map((run) => `${file}/${job}: ${run}`)))
    expect(pasted).toEqual([])
  })
})

describe('the actions and tools (§10.3)', () => {
  test('§10.3 parses into its actions and tools', () => {
    expect(actions.size).toBeGreaterThanOrEqual(8)
    expect(actions.get('actions/checkout')?.release).toBe('v7.0.1')
    expect(tool('Node')).toBe('24')
  })

  test('every `uses` is an action of §10.3, pinned by its full SHA with its release in the comment (acceptance 1)', () => {
    const problems: string[] = []
    let count = 0
    for (const [file, source] of sources) {
      source.split('\n').forEach((line, index) => {
        if (!/^\s*(?:- )?uses:/.test(line)) return
        const at = `${file}:${index + 1}`
        const match = /^\s*(?:- )?uses:\s*([\w./-]+)@([0-9a-f]{40})\s+#\s*(v\d+\.\d+\.\d+)\s*$/.exec(line)
        if (!match) return void problems.push(`${at} does not read "uses: <action>@<40-hex sha> # <release>": ${line.trim()}`)
        count += 1
        const [, name, sha, release] = match
        const pin = actions.get(name)
        if (!pin) problems.push(`${at} uses ${name}, which §10.3 does not list`)
        else if (sha !== pin.sha) problems.push(`${at} pins ${name} to ${sha}, but §10.3 says ${pin.sha}`)
        else if (release !== pin.release) problems.push(`${at} says ${release} for ${name}, but §10.3 says ${pin.release}`)
      })
    }
    expect(count).toBeGreaterThan(10)
    expect(problems).toEqual([])
  })

  test('Node, Bun, uv and Rust are the versions of §10.3', () => {
    const inputs = (action: string, key: string) =>
      allSteps().flatMap(({ step }) => (step.uses?.startsWith(`${action}@`) ? [String(step.with?.[key])] : []))
    expect(new Set(inputs('actions/setup-node', 'node-version'))).toEqual(new Set([tool('Node')]))
    expect(new Set(inputs('oven-sh/setup-bun', 'bun-version'))).toEqual(new Set([tool('Bun')]))
    expect(new Set(inputs('astral-sh/setup-uv', 'version'))).toEqual(new Set([tool('uv')]))
    expect(workflow('labs.yml').env?.RUST_TOOLCHAIN).toBe(tool('Rust'))
  })

  test("every Bun step falls back to npm's copy of the same release when GitHub's download fails (§10.3)", () => {
    const fallback = 'npm install --global --no-audit --no-fund "bun@$BUN_VERSION" && test "$(bun --version)" = "$BUN_VERSION"'
    const problems: string[] = []
    let count = 0
    for (const file of files) {
      for (const [job, { steps = [] }] of jobsOf(file)) {
        steps.forEach((step, index) => {
          if (!step.uses?.startsWith('oven-sh/setup-bun@')) return
          count += 1
          const at = `${file}/${job}`
          if (step.id !== 'bun' || step['continue-on-error'] !== true) problems.push(`${at}: setup-bun needs id: bun and continue-on-error: true`)
          const next = steps[index + 1]
          if (next?.if !== BUN_FALLBACK) return void problems.push(`${at}: the step after setup-bun is not the fallback that runs when it failed`)
          if (next.env?.BUN_VERSION !== tool('Bun')) problems.push(`${at}: the fallback installs Bun ${next.env?.BUN_VERSION}, but §10.3 pins ${tool('Bun')}`)
          if (next.run?.trim() !== fallback) problems.push(`${at}: the fallback runs "${next.run?.trim()}", not "${fallback}"`)
        })
      }
    }
    expect(count).toBeGreaterThan(0)
    expect(problems).toEqual([])
  })
})

describe("uv and the grader's pins in the labs workflow (W2-T02): uv 0.10.2 exactly, from the action or else from PyPI", () => {
  const pip = [
    'python3 -m venv "$RUNNER_TEMP/uv-venv"',
    '"$RUNNER_TEMP/uv-venv/bin/python" -m pip install --no-input "uv==$UV_VERSION"',
    'echo "$RUNNER_TEMP/uv-venv/bin" >> "$GITHUB_PATH"',
    'test "$("$RUNNER_TEMP/uv-venv/bin/uv" --version | cut -d \' \' -f 2)" = "$UV_VERSION"',
  ].join('\n')

  test("every uv step falls back to PyPI's copy of the same release when GitHub's download fails, and checks the version it got", () => {
    const problems: string[] = []
    let count = 0
    for (const file of files) {
      for (const [job, { steps = [] }] of jobsOf(file)) {
        steps.forEach((step, index) => {
          if (!step.uses?.startsWith('astral-sh/setup-uv@')) return
          count += 1
          const at = `${file}/${job}`
          if (step.id !== 'uv' || step['continue-on-error'] !== true) problems.push(`${at}: setup-uv needs id: uv and continue-on-error: true`)
          const next = steps[index + 1]
          if (next?.if !== UV_FALLBACK) return void problems.push(`${at}: the step after setup-uv is not the fallback that runs when it failed`)
          if (next.env?.UV_VERSION !== tool('uv')) problems.push(`${at}: the fallback installs uv ${next.env?.UV_VERSION}, but §10.3 pins ${tool('uv')}`)
          if (next.run?.trim() !== pip) problems.push(`${at}: the fallback runs "${next.run?.trim()}", not the pinned install with its version check`)
        })
      }
    }
    expect(count).toBeGreaterThan(0)
    expect(problems).toEqual([])
  })

  test('nothing installs uv any other way: no `latest`, no unpinned pip install, no piped installer, and every version input is the pin', () => {
    const scripts = allSteps().flatMap(({ file, job, step }) => (step.run === undefined ? [] : [{ at: `${file}/${job}`, run: step.run }]))
    const mentions = scripts.filter(({ run }) => /\buv\b/.test(run) && /install/.test(run))
    // The fallback is the one step that installs it, and it pins it through UV_VERSION.
    expect(mentions.map(({ run }) => run.trim())).toEqual([pip])
    for (const { run } of scripts) expect(run).not.toMatch(/curl[^\n]*\|\s*(?:ba)?sh/)
    for (const { step } of allSteps().filter(({ step }) => step.uses?.startsWith('astral-sh/setup-uv@'))) {
      expect(String(step.with?.version)).toBe(tool('uv'))
      expect(String(step.with?.version)).toMatch(/^\d+\.\d+\.\d+$/)
      expect(step.with?.['version-file']).toBeUndefined()
    }
  })

  test("the grader's pins are TRACKER's and statespace's: uv_build 0.10.2 builds it, and jsonschema 4.26.0 is its one dependency", () => {
    expect(tool('uv')).toBe('0.10.2')
    const pyproject = read('labs/grader/pyproject.toml')
    expect(pyproject).toContain('requires = ["uv_build==0.10.2"]')
    expect(pyproject).toContain('dependencies = ["jsonschema==4.26.0"]')
  })
})

describe('permissions and credentials (acceptance 1)', () => {
  /** The jobs that need more than `contents: read`, and exactly what they need. */
  const widened: Record<string, Record<string, string>> = {
    'deploy.yml/deploy': { pages: 'write', 'id-token': 'write' },
    'nightly.yml/report': { issues: 'write' },
  }

  test('every workflow defaults its jobs to contents: read', () => {
    for (const file of files) expect([file, workflow(file).permissions]).toEqual([file, { contents: 'read' }])
  })

  test('only the jobs that need more widen that, and by exactly what they need', () => {
    const found = Object.fromEntries(
      files.flatMap((file) => jobsOf(file).flatMap(([name, job]) => (job.permissions ? [[`${file}/${name}`, job.permissions]] : []))),
    )
    expect(found).toEqual(widened)
  })

  test('every checkout drops the token from the clone', () => {
    const checkouts = allSteps().filter(({ step }) => step.uses?.startsWith('actions/checkout@'))
    expect(checkouts.length).toBeGreaterThan(5)
    for (const { file, job, step } of checkouts) expect([file, job, step.with?.['persist-credentials']]).toEqual([file, job, false])
  })
})

describe('ci.yml (§10.1)', () => {
  test('runs on pull requests, and has the jobs fast-gate, tests, e2e-smoke and e2e-features', () => {
    expect(Object.keys(workflow('ci.yml').on ?? {})).toContain('pull_request')
    expect(jobsOf('ci.yml').map(([name]) => name)).toEqual(expect.arrayContaining(['fast-gate', 'tests', 'e2e-smoke']))
    expect(jobsOf('ci.yml').map(([name]) => name)).toContain('e2e-features')
  })

  test('e2e-features (W2b-T71, D-078) runs the features project in four shards, in a group of its own that never cancels a running shard, with the smoke job\'s flags and no retry or skip of its own', () => {
    const job = workflow('ci.yml').jobs?.['e2e-features'] as Job & { concurrency?: { group?: string; 'cancel-in-progress'?: boolean } }
    expect(job.strategy?.['fail-fast']).toBe(false)
    expect(job.strategy?.matrix?.shard).toEqual([1, 2, 3, 4])
    // The group is the job's own, and the shard is in it: one group for four shards would queue three of them and replace a waiting one.
    expect(job.concurrency?.['cancel-in-progress']).toBe(false)
    expect(job.concurrency?.group).toContain('e2e-features')
    expect(job.concurrency?.group).toContain('${{ matrix.shard }}')
    expect(job.concurrency?.group).not.toBe('ci-${{ github.ref }}')
    expect(typeof job['timeout-minutes']).toBe('number')
    expect(job['timeout-minutes']).toBeLessThanOrEqual(25)

    const run = (stepsOf('ci.yml', 'e2e-features').find((step) => step.run?.includes('playwright test'))?.run ?? '').trim()
    expect(run).toBe('npx playwright test --project=features --shard="$SHARD/4" --reporter=list,html,json')
    // The smoke job's own command, with the project and the reporters changed: no flag that sets the workers or the retries, so the configuration's apply.
    const smoke = (stepsOf('ci.yml', 'e2e-smoke').find((step) => step.run?.includes('playwright test'))?.run ?? '').trim()
    expect(smoke).toBe('npx playwright test --project=smoke --shard="$SHARD/4"')
    for (const text of [run, ...runsOf('ci.yml', 'e2e-features')]) expect(text).not.toMatch(/--retries|--workers|--grep|--max-failures/)
    expect(stepsOf('ci.yml', 'e2e-features').find((step) => step.run?.includes('playwright test'))?.env?.SHARD).toBe('${{ matrix.shard }}')
    // The configuration holds what the job leaves to it, and this task does not edit it.
    const config = read('playwright.config.ts')
    expect(config).toContain('retries: CI ? 1 : 0')
    expect(config).toContain('workers: CI ? 2 : undefined')
    expect(config).toContain("{ name: 'features', testIgnore: [...SMOKE, LAB], use: chromium }")
  })

  test('e2e-features prints every test that passed only on its retry, and keeps the report whatever the result', () => {
    const steps = stepsOf('ci.yml', 'e2e-features')
    const printer = steps.find((step) => step.run?.includes("'flaky'"))
    expect(printer?.if).toBe('${{ !cancelled() }}')
    expect(printer?.run).toContain('features-report.json')
    expect(steps.findIndex((step) => step === printer)).toBeGreaterThan(steps.findIndex((step) => step.run?.includes('playwright test')))
    const keep = steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(keep?.if).toBe('${{ !cancelled() }}')
    expect(String(keep?.with?.name)).toBe('e2e-features-${{ matrix.shard }}')
  })

  test('D-078 records the job, and says that it is not a required check until the owner makes it one (N14)', () => {
    const record = between(read('docs/DECISIONS.md'), '### D-078', '### D-079')
    expect(record).toContain('e2e-features')
    expect(record).toContain('not a required check')
  })

  test('the fast gate runs lint, typecheck, the compile, the source gates, the build and then the build gates, in that order', () => {
    const runs = runsOf('ci.yml', 'fast-gate')
    const at = (needle: string) => {
      const index = runs.findIndex((run) => run.includes(needle))
      if (index < 0) throw new Error(`the fast gate has no step that runs "${needle}"`)
      return index
    }
    const order = ['npm ci', 'npm run lint', 'npm run typecheck', 'scripts/content/build.ts', 'verify:all --stage source', 'npm run build', 'verify:all --stage build']
    const positions = order.map(at)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(new Set(positions).size).toBe(order.length)
  })

  test('the tests job installs, and runs its shard of the unit suite: one job for each shard of `bun test --shard`, none cancelling the others (W1b-T13)', () => {
    const { command, count, matrix } = ciTestShards()
    expect(runsOf('ci.yml', 'tests')).toEqual(['npm ci', command])
    expect(command).toBe(`bun run test --shard="$SHARD/${count}"`)
    expect(matrix).toEqual(Array.from({ length: count }, (_, at) => at + 1))
    const job = workflow('ci.yml').jobs?.tests
    expect(job?.strategy?.['fail-fast']).toBe(false)
    // The shard number reaches the command through `env`, as every value does (the test above that bans a pasted expression).
    expect(stepsOf('ci.yml', 'tests').find((step) => step.run?.trim() === command)?.env).toEqual({ SHARD: '${{ matrix.shard }}' })
  })

  test('a shard of the unit suite has a backstop below the 30 minutes that the whole suite was given in one job, and it is a number', () => {
    // The suite took 9 to 16 minutes in one job on a runner [measured 2026-11-09, PR #2 to #4], and the 30 held it until it was split. A shard
    // runs at most a third of it (tests/ci/shards.test.ts lists the files), so the backstop is the 15 minutes that the job had before W1.
    const backstop = workflow('ci.yml').jobs?.tests?.['timeout-minutes']
    expect(typeof backstop).toBe('number')
    expect(backstop).toBeLessThanOrEqual(15)
  })

  test('every gate of the registry runs in some workflow, and only verify:labs, which needs Rust, stays out of the fast gate', () => {
    const covered = new Set<string>()
    for (const file of files) {
      for (const [job] of jobsOf(file)) {
        for (const run of runsOf(file, job)) {
          for (const stage of ['source', 'build', 'toolchain']) {
            if (run.includes(`verify:all --stage ${stage}`)) GATE_NAMES.filter((name) => GATES[name].stage === stage).forEach((name) => covered.add(name))
          }
          for (const [, name] of run.matchAll(/bun run verify:(?!all)([a-z]+)/g)) covered.add(name)
        }
      }
    }
    expect(GATE_NAMES.filter((name) => !covered.has(name))).toEqual([])

    const fastGate = runsOf('ci.yml', 'fast-gate').join('\n')
    expect(fastGate).not.toContain('verify:labs')
    expect(fastGate).not.toContain('--stage toolchain')
  })
})

describe('deploy.yml (acceptance 3)', () => {
  test('runs on pushes to main and by hand (workflow_dispatch, so that main can be deployed once PAGES_ENABLED is set), and nothing else', () => {
    expect(workflow('deploy.yml').on).toEqual({ push: { branches: ['main'] }, workflow_dispatch: null })
  })

  test('both jobs wait for PAGES_ENABLED, which is set when W1 is on its way to main (O-2 was answered on 2026-11-08, D-060)', () => {
    expect(jobsOf('deploy.yml').map(([name, job]) => [name, job.if])).toEqual([
      ['build', "vars.PAGES_ENABLED == 'true'"],
      ['deploy', "vars.PAGES_ENABLED == 'true'"],
    ])
  })

  test('builds and prepares the Pages directory at the root of the custom domain: nothing sets VITE_BASE, so the base is "/" (D-058)', () => {
    const steps = stepsOf('deploy.yml', 'build')
    for (const command of ['npm run build', 'scripts/prepare-pages.ts']) {
      expect([command, steps.some((step) => step.run?.includes(command))]).toEqual([command, true])
    }
    // No VITE_BASE at the top of the workflow, in a job or in a step: vite.config.ts and prepare-pages both take "/" when it is unset.
    // A preview or a fork that is served under a subpath sets the variable in its own copy of the workflow.
    const keysOf = (value: unknown): string[] =>
      value !== null && typeof value === 'object' ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]) : []
    expect(keysOf(workflow('deploy.yml'))).not.toContain('VITE_BASE')
  })

  test('says in its header that the site is served at https://enginespace.naigap.com, and lists the steps that turn it on, in order, with where each stands', () => {
    const source = sources.get('deploy.yml') ?? ''
    // The comment block above `on:`, with the comment marks and the line breaks taken out.
    const header = source.slice(0, source.indexOf('\non:')).replace(/\n#\s?/g, ' ')
    expect(header).toContain('The site is served at https://enginespace.naigap.com')
    const steps = [
      'enable Pages with the source "GitHub Actions"',
      'set the custom domain to enginespace.naigap.com and enforce HTTPS',
      "set the repository variable PAGES_ENABLED to 'true'",
    ].map((step) => [step, header.indexOf(step)] as const)
    expect(steps.filter(([, at]) => at < 0).map(([step]) => step)).toEqual([])
    expect(steps.map(([, at]) => at)).toEqual(steps.map(([, at]) => at).sort((a, b) => a - b))
  })

  test("gives enforcing HTTPS as the owner's action and not as something GitHub does by itself, and tags what the header says of the certificate, the variable and the environment", () => {
    const source = sources.get('deploy.yml') ?? ''
    const header = source
      .slice(0, source.indexOf('\non:'))
      .replace(/\n#\s?/g, ' ')
      .replace(/\s+/g, ' ')
    // For a custom domain "Enforce HTTPS" is an option that GitHub offers once it has issued the certificate, and someone ticks it. A reader who
    // took it for automatic would skip it, and the site would also be served over http, where the forge's crypto.subtle hashing fails.
    expect(header).toContain("Enforcing HTTPS does not turn itself on for a custom domain, and it is the owner's to do")
    expect(header).toContain('tick Enforce HTTPS in Settings → Pages, or set https_enforced through the Pages API')
    expect(header).not.toMatch(/GitHub enforces HTTPS|HTTPS is enforced once/)
    // The 24 hours stay GitHub's, attributed to its docs; the 110 minutes are a measurement.
    expect(header).toContain("GitHub says the option can take up to 24 hours to become available [measured from GitHub's docs, 2026-11-08]")
    expect(header).toContain('no certificate in the 110 minutes after the domain was set [measured 2026-11-08]')
    // The variable is set on a day, with W1's merge, and the environment's branch policy was read and is no longer a guess.
    expect(header).toContain("PAGES_ENABLED to 'true', which is set on 2026-11-08, with W1's merge to main (PR #2)")
    expect(header).toContain("its one policy is the branch main, so it deploys main only [measured 2026-11-08, from the environment's settings through GitHub's API]")
    expect(header).not.toContain('[unverified')
  })

  test('uploads dist/ and deploys it to the github-pages environment, after the build', () => {
    const upload = stepsOf('deploy.yml', 'build').find((step) => step.uses?.startsWith('actions/upload-pages-artifact@'))
    expect(upload?.with).toEqual({ path: 'dist' })
    const job = workflow('deploy.yml').jobs?.deploy
    expect(job?.needs).toBe('build')
    expect(job?.environment?.name).toBe('github-pages')
    expect(job?.steps?.map((step) => step.uses?.split('@')[0])).toEqual(['actions/deploy-pages'])
  })

  test('runs every command that the fast gate and the tests job of ci.yml run, so a deploy is never less checked than a pull request', () => {
    const deployed = new Set(runsOf('deploy.yml', 'build'))
    // The tests job runs one shard of the suite, `bun run test --shard="$SHARD/4"`, and the deploy runs the suite whole, `bun run test`: the
    // shard's command without its flag is the deploy's, so the deploy runs everything that every shard runs (W1b-T13).
    const whole = (run: string) => run.replace(/ --shard="\$SHARD\/\d+"$/, '')
    const reviewed = [...runsOf('ci.yml', 'fast-gate'), ...runsOf('ci.yml', 'tests').map(whole)]
    expect(reviewed.filter((run) => !deployed.has(run))).toEqual([])
    expect(reviewed).toContain('bun run test')
  })

  test('runs the whole suite in its build job, not a shard of it (W1b-T13)', () => {
    const suite = runsOf('deploy.yml', 'build').filter((run) => /\btest\b/.test(run))
    expect(suite).toEqual(['bun run test'])
    expect(jobsOf('deploy.yml').flatMap(([, job]) => Object.keys(job.strategy ?? {}))).toEqual([])
  })
})

describe('nightly.yml (acceptance 4)', () => {
  test('runs at the slot of §10.1 and by hand', () => {
    expect(workflow('nightly.yml').on).toEqual({ schedule: [{ cron: '17 3 * * *' }], workflow_dispatch: null })
  })

  test('the report job waits for every other job and runs when any of them failed', () => {
    const others = jobsOf('nightly.yml')
      .map(([name]) => name)
      .filter((name) => name !== 'report')
    const report = workflow('nightly.yml').jobs?.report
    expect(others.length).toBeGreaterThan(2)
    expect([...(report?.needs ?? [])].sort()).toEqual([...others].sort())
    expect(report?.if).toContain('always()')
    expect(report?.if).toContain("contains(needs.*.result, 'failure')")
  })

  test('the report job opens the nightly-failure issue, or comments on the one that is open', () => {
    const script = runsOf('nightly.yml', 'report').join('\n')
    expect(script).toContain('gh label create nightly-failure')
    expect(script).toContain('gh issue list --label nightly-failure --state open')
    expect(script).toContain('gh issue comment "$open"')
    expect(script).toContain('gh issue create --label nightly-failure')
    // It needs no action and no checkout: the GitHub CLI on the runner does the work, with the job's own token.
    expect(stepsOf('nightly.yml', 'report').some((step) => step.uses !== undefined)).toBe(false)
  })

  test('a trial run from another branch files no issue', () => {
    const condition = workflow('nightly.yml').jobs?.report?.if ?? ''
    expect(condition).toContain("github.event_name == 'schedule'")
    expect(condition).toContain('github.event.repository.default_branch')
  })

  test('turns on the heavy checks and the lab rates at the size of a nightly run, which no other workflow does (W1b-T13)', () => {
    const jobs = workflow('nightly.yml').jobs ?? {}
    // ES_HEAVY switches on tests/sim/bench-stats.test.ts's coverage of the p99 over 2,000 seeds, in the job that runs the whole suite.
    expect(jobs.properties?.env?.ES_HEAVY).toBe('1')
    expect(read('tests/sim/bench-stats.test.ts')).toContain("process.env['ES_HEAVY'] !== '1'")
    // ES_LAB_TRIALS is the size of tests/forge/rejection-sampler-rates.test.ts: 8 trials a row by default, and the job's 1,500 is the size that W1-T27 measured.
    const rates = jobs['lab-rates']
    expect(rates?.env).toEqual({ ES_LAB_TRIALS: '1500', ES_LAB_REPORT: '1' })
    expect(read('tests/forge/rejection-sampler-rates.test.ts')).toMatch(/Number\(process\.env\['ES_LAB_TRIALS'\] \?\? 8\)/)
    expect(runsOf('nightly.yml', 'lab-rates')).toEqual(['npm ci', 'bun test tests/forge/rejection-sampler-rates.test.ts'])
    expect(typeof rates?.['timeout-minutes']).toBe('number')
    // A pull request, a deploy and the lab workflow run the small sizes: the knobs are set in nightly.yml and nowhere else.
    const envOf = (file: string) =>
      [workflow(file).env, ...jobsOf(file).flatMap(([, job]) => [job.env, ...(job.steps ?? []).map((step) => step.env)])].flatMap((env) => Object.keys(env ?? {}))
    for (const file of files.filter((name) => name !== 'nightly.yml')) {
      expect([file, envOf(file).filter((key) => key === 'ES_HEAVY' || key === 'ES_LAB_TRIALS')]).toEqual([file, []])
    }
  })

  test('the schedule spends no Actions minutes until the owner sets NIGHTLY_ENABLED, and a run by hand always runs (D-052)', () => {
    const checks = jobsOf('nightly.yml')
      .map(([name]) => name)
      .filter((name) => name !== 'report')
    for (const name of checks) {
      expect(workflow('nightly.yml').jobs?.[name]?.if).toBe("${{ github.event_name == 'workflow_dispatch' || vars.NIGHTLY_ENABLED == 'true' }}")
    }
  })
})

describe('labs.yml (§10.1)', () => {
  const labsOn = workflow('labs.yml').on as { pull_request?: { paths?: string[] }; workflow_dispatch?: unknown }
  const labsPaths = labsOn.pull_request?.paths ?? []

  /** Whether a path filter of labs.yml names `file`. The filter's forms are `dir/**` and one file; any other form throws instead of being guessed at. */
  function names(globs: readonly string[], file: string): boolean {
    return globs.some((glob) => {
      const body = glob.endsWith('/**') ? glob.slice(0, -3) : glob
      if (/[*?![\]]/.test(body)) throw new Error(`labs.yml's path "${glob}" is in a form that this test does not read: write "dir/**" or one file`)
      return glob.endsWith('/**') ? file.startsWith(`${body}/`) : file === glob
    })
  }

  test('runs for a change to what the lab gates read, and by hand: the labs, the schemas and the receipt rules (W0-T04), what verify:labs imports and compares (W1b-T13), the grader\'s fixtures (W2-T02, W2-T05), what the receipt fixtures step reads (W2-T08), and the course lock that the pin checks of the grader read (W2-T04), and the tensor vectors and their script that the cpu job compares (W2-T13)', () => {
    expect(labsPaths).toEqual([
      'labs/**',
      'course.lock.json',
      'schemas/**',
      'packages/schema/**',
      'packages/verify/**',
      'packages/sim/**',
      'src/forge/**',
      'src/workers/forge.worker.ts',
      'scripts/labs/**',
      'scripts/verify-labs.ts',
      'tests/fixtures/forge/**',
      'tests/fixtures/grader/**',
      'tests/fixtures/references/**',
      'tests/fixtures/receipts/**',
      'tests/fixtures/tensor/**',
      'scripts/tensor-torch-vectors.py',
      'tests/verify/**',
      'tests/schema/receipt-support.ts',
      'src/receipts/atlas.ts',
      'vendor/kernelspace/**',
      'public/labs/**',
      'src/receipts/graders.ts',
      'scripts/pack-kit.ts',
      'scripts/pack-labs.ts',
      '.github/workflows/labs.yml',
    ])
    expect('workflow_dispatch' in labsOn).toBe(true)
    // W2b-T71: what pack-kit --check compares (the committed packs) and the scripts that pack, which labs/** and scripts/labs/** do not cover.
    for (const file of ['public/labs/manifest.json', 'src/receipts/graders.ts', 'scripts/pack-kit.ts', 'scripts/pack-labs.ts', 'scripts/labs/zip.ts', 'labs/kit/README.template.md', 'course.lock.json'])
      expect(names(labsPaths, file), file).toBe(true)
  })

  test('has the cpu job (W2-T13): switched on by detect when the CPU environment, its fixture and the script exist and a change touched them, and it syncs from the lock and compares the vectors without writing the fixture', () => {
    const jobs = Object.fromEntries(jobsOf('labs.yml'))
    expect([jobs.cpu.needs, jobs.cpu.if]).toEqual(['detect', "needs.detect.outputs.cpu == 'true'"])
    const detect = jobs.detect.steps?.find((step) => step.id === 'labs')?.run ?? ''
    // The change is read from the first parent of the merge commit, and the paths are the ones the task names, the TR0 lab's included.
    expect(detect).toContain('git diff --quiet HEAD^1 HEAD -- labs/envs/cpu tests/fixtures/tensor scripts/tensor-torch-vectors.py')
    expect(detect).toContain("'labs/grader/src/enginespace_grader/labs/tr0*'")
    expect(detect).toContain('echo "cpu=$cpu" >> "$GITHUB_OUTPUT"')
    expect(jobs.detect as unknown as { outputs?: Record<string, string> }).toMatchObject({ outputs: { cpu: '${{ steps.labs.outputs.cpu }}' } })
    const steps = jobs.cpu.steps ?? []
    const uses = steps.map((step) => step.uses?.split('@')[0]).filter((name) => name !== undefined)
    expect(uses).toEqual(['actions/checkout', 'actions/setup-python'])
    expect(steps.find((step) => step.uses?.startsWith('actions/setup-python@'))?.with?.['python-version']).toBe('3.12')
    expect(runsOf('labs.yml', 'cpu')).toEqual([
      'python3 -m venv "$RUNNER_TEMP/cpu-venv"\n"$RUNNER_TEMP/cpu-venv/bin/python" -m pip install --no-input --no-deps --require-hashes --extra-index-url https://download.pytorch.org/whl/cpu -r labs/envs/cpu/requirements.txt',
      '"$RUNNER_TEMP/cpu-venv/bin/python" -I scripts/tensor-torch-vectors.py --out "$RUNNER_TEMP/torch-vectors.json" --compare tests/fixtures/tensor/torch-vectors.json',
      '"$RUNNER_TEMP/cpu-venv/bin/python" -m unittest discover -v -s labs/grader/tests/cpu -p "test_*.py"',
      '"$RUNNER_TEMP/cpu-venv/bin/python" -I -m unittest discover -v -s scripts/triton-interp -p "test_*.py"\n"$RUNNER_TEMP/cpu-venv/bin/python" -I scripts/triton-interp/course_kernel.py',
      '"$RUNNER_TEMP/cpu-venv/bin/python" -I scripts/triton-interp/run.py --json "$RUNNER_TEMP/triton-interp.json"',
    ])
    expect(typeof jobs.cpu['timeout-minutes']).toBe('number')
    // The fixture is never written by CI: the job's only --out is in RUNNER_TEMP.
    expect(runsOf('labs.yml', 'cpu').join('\n')).not.toMatch(/--out (?!"\$RUNNER_TEMP)/)
    expect(runsOf('labs.yml', 'cpu').join('\n')).not.toMatch(/\buv\b/)
  })

  test('the cpu job also runs the TR0 lab\'s tests in the CPU environment, with CI set so that a missing torch fails them (W2b-T48)', () => {
    const jobs = Object.fromEntries(jobsOf('labs.yml'))
    const step = (jobs.cpu.steps ?? []).find((candidate) => candidate.name === 'The TR0 lab, on a small random-weight model')
    expect(step?.run).toBe('"$RUNNER_TEMP/cpu-venv/bin/python" -m unittest discover -v -s labs/grader/tests/cpu -p "test_*.py"')
    expect((step as unknown as { env?: Record<string, string> }).env).toEqual({ CI: 'true', PYTHONPATH: 'labs/grader/src' })
    // It runs in the environment that the lock exports, with no network and no second installer, and it fetches no model.
    expect(step?.run).not.toMatch(/\buv\b|pip|curl|wget|fetch|huggingface/)
    const detect = jobs.detect.steps?.find((candidate) => candidate.id === 'labs')?.run ?? ''
    for (const pathspec of ["'labs/grader/tests/cpu'", "'labs/grader/src/enginespace_grader/checks'", "'labs/grader/tests/test_tr0*'"]) expect(detect).toContain(pathspec)
    // The tests of that folder are found by this discovery only: the grader job's `python -m unittest` from the root never walks into a folder that is no package.
    expect(existsSync(path.join(root, 'labs/grader/tests/cpu/__init__.py'))).toBe(false)
  })

  test('the cpu job runs Triton 3.8.0\'s interpreter: its script\'s tests and the course\'s kernel with CI set, then the pinned vLLM kernels, which end green whatever they find (W2b-T49)', () => {
    const jobs = Object.fromEntries(jobsOf('labs.yml'))
    const steps = jobs.cpu.steps ?? []
    const own = steps.find((candidate) => candidate.name === 'The interpreter script, on stand-in kernels, and the course\'s own kernel')
    expect((own as unknown as { env?: Record<string, string> }).env).toEqual({ CI: 'true' })
    const vllm = steps.find((candidate) => candidate.name === 'Which of vLLM\'s pinned kernels run under the interpreter')
    expect(vllm?.run).toBe('"$RUNNER_TEMP/cpu-venv/bin/python" -I scripts/triton-interp/run.py --json "$RUNNER_TEMP/triton-interp.json"')
    // A kernel that does not run is a finding and not a red job: the step is not told to require them all, and nothing continues past an error of its own.
    expect(vllm?.run).not.toMatch(/--require-all-ran/)
    expect((vllm as unknown as Record<string, unknown>)['continue-on-error']).toBeUndefined()
    // Only the pinned commit is read, with no token: the step has no env of its own and the script names the commit of course.lock.json.
    expect((vllm as unknown as Record<string, unknown>).env).toBeUndefined()
    expect(read('scripts/triton-interp/run.py')).toContain('4ba787ec9959e566d3b587a796dff07673324da5')
    expect(JSON.stringify(JSON.parse(read('course.lock.json')))).toContain('4ba787ec9959e566d3b587a796dff07673324da5')
    expect(jobs.detect.steps?.find((candidate) => candidate.id === 'labs')?.run ?? '').toContain('scripts/triton-interp')
    // The environment carries the wheel, on Linux only, at the pin vLLM v0.33.0 ships.
    expect(read('labs/envs/cpu/pyproject.toml')).toContain('"triton==3.8.0; sys_platform == \'linux\'"')
    expect(read('labs/envs/cpu/requirements.txt')).toContain("triton==3.8.0 ; sys_platform == 'linux'")
  })

  test('the weights job (W2-T16) runs on a dispatch and on nothing else: it fetches the pinned weights, hashes each file against the manifest, and prints the worst difference of the reference and the mutants', () => {
    const jobs = Object.fromEntries(jobsOf('labs.yml'))
    const weights = jobs.weights as unknown as { if?: string; needs?: unknown; env?: Record<string, string>; steps?: { name?: string; run?: string; env?: Record<string, string> }[] }
    // Only a dispatch starts it (a pull request must never download a model), and it waits for no other job: detect's outputs say nothing about it.
    expect(weights.if).toBe("github.event_name == 'workflow_dispatch'")
    expect(weights.needs).toBeUndefined()
    expect(weights.env).toEqual({ ENGINESPACE_CACHE: '${{ github.workspace }}/.enginespace-cache', PYTHONPATH: 'labs/grader/src' })
    const steps = weights.steps ?? []
    const byName = (name: string) => steps.find((step) => step.name === name)
    // The same environment as the cpu job, from the lock's hashed export.
    expect(byName("Install the CPU environment from its lock's export")?.run?.trim()).toBe(
      'python3 -m venv "$RUNNER_TEMP/cpu-venv"\n"$RUNNER_TEMP/cpu-venv/bin/python" -m pip install --no-input --no-deps --require-hashes --extra-index-url https://download.pytorch.org/whl/cpu -r labs/envs/cpu/requirements.txt',
    )
    // `enginespace fetch tr0.forward` is the only command that reaches the network, and it is the grader's own, which keeps a file only when it hashes to the manifest's.
    expect(byName('Fetch the pinned weights')?.run).toBe('"$RUNNER_TEMP/cpu-venv/bin/python" -m enginespace_grader fetch tr0.forward')
    const hash = byName('Hash each file against the references manifest')?.run ?? ''
    expect(hash).toContain('labs/references/manifest.json')
    expect(hash).toContain('"tr0.forward" not in entry["labs"]')
    expect(hash).toContain('sys.exit(1 if bad else 0)')
    const measure = byName('The reference and the mutants, on the pinned weights')
    expect(measure?.env).toEqual({ CI: 'true' })
    expect(measure?.run).toContain('labs/grader/tests/cpu/weights_margin.py')
    // It reads no token and sends nothing: no secrets, no vars, no curl or wget of its own, and no step that writes to the repository.
    const text = JSON.stringify(weights)
    expect(text).not.toMatch(/secrets\.|HF_TOKEN|GITHUB_TOKEN|curl|wget|git push|upload-artifact/)
    expect(Object.keys(jobs)).toContain('weights')
    // The cache is keyed by the manifest, so a changed pin is a new download.
    const cache = steps.find((step) => (step as { uses?: string }).uses?.startsWith('actions/cache@')) as unknown as { with?: Record<string, string> } | undefined
    expect(cache?.with?.key).toBe("tr0-weights-${{ hashFiles('labs/references/manifest.json') }}")
    // Its script is not a test of the cpu job's discovery, and it is in the folder that detect watches.
    expect(existsSync(path.join(root, 'labs/grader/tests/cpu/weights_margin.py'))).toBe(true)
    expect(jobs.detect.steps?.find((candidate) => candidate.id === 'labs')?.run ?? '').toContain("'labs/gpu/tr0-forward'")
  })

  test('the vectors script has no header that says it is run by hand and never by CI (W2-T13)', () => {
    const script = read('scripts/tensor-torch-vectors.py')
    expect(script).not.toContain('by hand')
    expect(script).not.toContain('never by CI')
    expect(script).toContain('labs/envs/cpu')
    expect(read('tests/fixtures/tensor/torch-vectors.json')).not.toContain('run by hand')
  })

  test('names every file that verify:labs imports, and every folder that it reads, so that a new dependency of the gate adds its path here (W1b-T13)', () => {
    // The static imports of the script, and of the worker that the forge pool starts with `new URL(…, import.meta.url)`, which no import walk sees.
    expect(read('src/forge/worker-pool.ts')).toContain("new URL('../workers/forge.worker.ts', import.meta.url)")
    const imported = checkBoundaries(root, ['scripts/verify-labs.ts', 'src/workers/forge.worker.ts']).reachable
    expect(imported).toEqual(expect.arrayContaining(['scripts/verify-labs.ts', 'scripts/labs/judge.ts', 'src/forge/host.ts', 'src/workers/forge.worker.ts']))
    expect(imported.filter((file) => !names(labsPaths, file))).toEqual([])
    // The folders it reads without importing: the crates, the builds that are committed to compare its own with, and the vendored kit.
    const folders = [...read('scripts/verify-labs.ts').matchAll(/path\.join\(ROOT, '([^']+)'\)/g)].map((match) => match[1]).sort()
    expect(folders).toEqual(['labs/forge', 'tests/fixtures/forge', 'vendor/kernelspace/labs/kit'])
    expect(folders.filter((folder) => !names(labsPaths, `${folder}/a-file`))).toEqual([])
    // The folders that W1's report found missing (§12).
    for (const folder of ['src/forge', 'packages/sim', 'scripts/labs', 'tests/fixtures/forge']) expect(names(labsPaths, `${folder}/a-file`), folder).toBe(true)
  })

  test('the check can fail: the filter before W1b-T13 misses a file that the gate imports, and a form it does not read throws', () => {
    const before = ['labs/**', 'schemas/**', 'packages/schema/**', 'packages/verify/**', '.github/workflows/labs.yml']
    const imported = checkBoundaries(root, ['scripts/verify-labs.ts', 'src/workers/forge.worker.ts']).reachable
    const missed = imported.filter((file) => !names(before, file))
    expect(missed).toEqual(expect.arrayContaining(['src/forge/host.ts', 'scripts/labs/judge.ts']))
    expect(missed.some((file) => file.startsWith('packages/sim/'))).toBe(true)
    expect(names(before, 'src/forge/host.ts')).toBe(false)
    expect(names(['src/forge/**'], 'src/forge/host.ts')).toBe(true)
    expect(names(['src/forge/**'], 'src/forge-other/host.ts')).toBe(false)
    expect(() => names(['src/**/*.ts'], 'src/forge/host.ts')).toThrow('does not read')
  })

  test('has the forge and grader jobs, each switched on by the lab it tests', () => {
    const jobs = Object.fromEntries(jobsOf('labs.yml'))
    expect(Object.keys(jobs)).toEqual(expect.arrayContaining(['detect', 'forge', 'grader']))
    expect([jobs.forge.needs, jobs.forge.if]).toEqual(['detect', "needs.detect.outputs.forge == 'true'"])
    expect([jobs.grader.needs, jobs.grader.if]).toEqual(['detect', "needs.detect.outputs.grader == 'true'"])
  })

  test("the grader job pins the interpreter that runs its tests (§10.3): one minor series, found and never downloaded", () => {
    const env = jobsOf('labs.yml').find(([job]) => job === 'grader')?.[1].env
    expect(env?.UV_PYTHON).toBe(tool('Python (the grader\'s tests in CI)'))
    expect(env?.UV_PYTHON).toMatch(/^3\.\d+$/)
    expect(env?.UV_PYTHON_DOWNLOADS).toBe('never')
    // uv may not download an interpreter, so the job installs it: setup-python, pinned by its 40-character SHA, before any uv step, and
    // reading the version from UV_PYTHON, so that the series is written once and the two cannot drift. Its first CI run found no 3.12 on ubuntu-26.04.
    const steps = jobsOf('labs.yml').find(([job]) => job === 'grader')?.[1].steps ?? []
    const python = steps.findIndex((step) => step.uses?.startsWith('actions/setup-python@'))
    expect(python).toBeGreaterThan(-1)
    expect(steps[python].uses).toMatch(/^actions\/setup-python@[0-9a-f]{40}$/)
    expect(String(steps[python].with?.['python-version'])).toBe('${{ env.UV_PYTHON }}')
    expect(steps[python].with?.['python-version-file']).toBeUndefined()
    const firstUv = steps.findIndex((step) => step.uses?.startsWith('astral-sh/setup-uv@') || /\buv\b/.test(step.run ?? ''))
    expect(firstUv).toBeGreaterThan(python)
    expect(read('labs/grader/pyproject.toml')).toContain('requires-python = ">=3.11,<3.15"')
  })

  test('the forge job tests the crates and runs verify:labs; the grader job syncs from the lockfile and runs its tests', () => {
    const forge = runsOf('labs.yml', 'forge').join('\n')
    expect(forge).toContain('cargo test')
    expect(forge).toContain('bun run verify:labs')
    expect(forge).toContain('--target wasm32-unknown-unknown')
    const grader = runsOf('labs.yml', 'grader')
    expect(grader).toContain('uv sync --locked --project labs/grader')
    expect(grader).toContain('uv run --project labs/grader python -m unittest')
    expect(grader).toContain('bun run verify:schema')
    expect(grader).toContain('bun run verify:vectors')
  })

  test('the grader job (W2-T02) checks the lock, syncs from it, runs the tests as TRACKER words the command, runs the installed command, then the two gates, then the check that the packed kit is what its sources pack to (W2b-T71), and then the receipt fixtures and forgeries of W2-T08, in that order; W2-T04 puts the check of the engine environments beside the lock check of the grader', () => {
    expect(runsOf('labs.yml', 'grader')).toEqual([
      'npm ci',
      'uv lock --check --project labs/grader',
      'bash labs/envs/relock.sh --check',
      'uv sync --locked --project labs/grader',
      'uv run --project labs/grader python -m unittest',
      'uv run --project labs/grader enginespace selftest --no-suite',
      'bun run verify:schema',
      'bun run verify:vectors',
      'bun scripts/pack-kit.ts --check',
      'bun test tests/verify/bestiary.test.ts tests/verify/fixtures.test.ts',
    ])
    // The commands of TRACKER's acceptance 1 and 4, word for word.
    const task = trackerTasks().get('W2-T02') ?? ''
    expect(task).toContain('`uv run --project labs/grader python -m unittest` passes on CPU')
    expect(task).toContain('`uv lock --check` is clean')
  })

  test('the grader job sets up Node, Bun, Python and then uv, and has a numeric timeout that is not longer than the forge job\'s', () => {
    const jobs = Object.fromEntries(jobsOf('labs.yml'))
    const uses = (jobs.grader.steps ?? []).map((step) => step.uses?.split('@')[0]).filter((name) => name !== undefined)
    expect(uses).toEqual(['actions/checkout', 'actions/setup-node', 'oven-sh/setup-bun', 'actions/setup-python', 'astral-sh/setup-uv'])
    expect(typeof jobs.grader['timeout-minutes']).toBe('number')
    expect(jobs.grader['timeout-minutes']).toBeLessThanOrEqual(jobs.forge['timeout-minutes'] ?? 0)
    expect(jobs.grader['timeout-minutes']).toBeLessThanOrEqual(20)
  })
})

describe('reserved steps', () => {
  test('each prints "pending: <task>" with a task that TRACKER.md has', () => {
    const tasks = trackerTasks()
    const reserved = [...sources].flatMap(([file, source]) => [...source.matchAll(/echo ['"]pending: ([^'"]+)['"]/g)].map((match) => ({ file, task: match[1] })))
    // Six are left [measured 2026-11-10 at the wave-2 tip, with W2-T08's change]: the content compile of ci.yml and of deploy.yml (W0-T08),
    // prepare-pages (W0-T19), the labs' two (W1-T10, W2-T02) and the link-rot report (W3-T13). The grader's receipt fixtures (W2-T08) had a seventh, until
    // W2-T08 built the step. The Export freshness step of both workflows had one more each, until W1-T35 built the check, so the count that stood
    // here, more than eight, could not hold. The list is exact, so a step that is added or built changes it in the same commit.
    expect(reserved.map(({ task }) => task).sort()).toEqual(['W0-T08', 'W0-T08', 'W0-T19', 'W1-T10', 'W2-T02', 'W3-T13'])
    expect(reserved.filter(({ task }) => !tasks.has(task))).toEqual([])
  })

  /**
   * The tasks that have merged into their wave branch. Add a task here when it lands: a reserved step that still names it fails the
   * test below, and the task's own change replaces the step. W0-T06 is not here because it merged into W0-T05 (D-047) and has no
   * heading in TRACKER.md. The status markers of TRACKER.md follow this list, not the other way round: the exit review sets them, so a
   * task can be here a while before its `[x]`, and none may have its `[x]` or `[=]` before it is here (the last test of this block).
   */
  const MERGED = [
    // W0, in wave-0.
    'W0-T01', 'W0-T02', 'W0-T03', 'W0-T04', 'W0-T05', 'W0-T07', 'W0-T08', 'W0-T09', 'W0-T10', 'W0-T11', 'W0-T12', 'W0-T13',
    'W0-T14', 'W0-T15', 'W0-T16', 'W0-T17', 'W0-T18', 'W0-T19', 'W0-T20', 'W0-T21', 'W0-T22', 'W0-T23', 'W0-T24', 'W0-T25',
    // W1, in wave-1: every build task of the wave, which its exit review (W1-T38) marked `[=]`.
    'W1-T01', 'W1-T03', 'W1-T04', 'W1-T05', 'W1-T06', 'W1-T07', 'W1-T08', 'W1-T09', 'W1-T10', 'W1-T11', 'W1-T12', 'W1-T13', 'W1-T14', 'W1-T15',
    'W1-T16', 'W1-T17', 'W1-T18', 'W1-T19', 'W1-T20', 'W1-T21', 'W1-T22', 'W1-T23', 'W1-T24', 'W1-T25', 'W1-T26', 'W1-T27', 'W1-T28', 'W1-T29',
    'W1-T30', 'W1-T31', 'W1-T32', 'W1-T33', 'W1-T34', 'W1-T35', 'W1-T36',
    // W1's exit review, in wave-1, whose open check W1b closed in wave-1b: W1b's exit review (W1b-T16) marked it `[=]`.
    'W1-T38',
    // W1b, in wave-1b: every task of the wave, which its exit review (W1b-T16) marked `[=]`. They were left out until the patterns of this file
    // and of support.ts read their ids (W1b-report §10, TASK_ID in support.ts); the last tests of this block hold the list to the tracker's.
    'W1b-T01', 'W1b-T02', 'W1b-T03', 'W1b-T04', 'W1b-T05', 'W1b-T06', 'W1b-T07', 'W1b-T08', 'W1b-T09', 'W1b-T10', 'W1b-T11', 'W1b-T12',
    'W1b-T13', 'W1b-T14', 'W1b-T15', 'W1b-T16',
    // W2, in wave-2: the tasks that have built a reserved step.
    'W2-T08',
    // W2's grader track, whose checks the tree meets in files (W2b-T01 set their markers to it), and W2b-T01 itself.
    'W2-T01', 'W2-T03', 'W2-T05', 'W2-T06', 'W2-T09', 'W2-T10', 'W2-T28', 'W2-T43', 'W2b-T01',
    // Wave 1 of the second plan, in wave-2m1a and wave-2m1b: the tasks of W2 that the two halves built, and every W2b task that merged, which
    // the exit review of wave 1b (W2b-T39) marked `[=]`. W2-T16 waits for the owner's weights job and stays `[~]`;
    // W2-T44 and W2b-T39 were marked in W2b-T69 (the line below).
    'W2-T14', 'W2-T18', 'W2-T42', 'W2b-T02', 'W2b-T43', 'W2b-T03', 'W2b-T04', 'W2b-T05', 'W2b-T06', 'W2b-T07', 'W2b-T40', 'W2b-T09',
    'W2b-T10', 'W2b-T11', 'W2b-T12', 'W2b-T13', 'W2b-T14', 'W2b-T15', 'W2b-T45', 'W2b-T16', 'W2b-T41', 'W2b-T17', 'W2b-T18', 'W2b-T19', 'W2b-T20',
    'W2b-T22', 'W2b-T21', 'W2b-T44', 'W2b-T23', 'W2b-T24', 'W2b-T25', 'W2b-T47', 'W2b-T30', 'W2b-T48', 'W2b-T49', 'W2b-T31', 'W2b-T50', 'W2b-T37',
    'W2b-T42', 'W2b-T26', 'W2b-T27', 'W2b-T46', 'W2b-T28', 'W2b-T29', 'W2b-T32', 'W2b-T51', 'W2b-T52', 'W2b-T33', 'W2b-T34', 'W2b-T35', 'W2b-T36',
    'W2b-T53',
    // Marked `[=]` with W2b-T69: the tasks of wave 1 whose markers were stale. W2-T08 is above, and stays `[~]` until the owner's fixtures (W2-T12).
    'W2-T02', 'W2-T07', 'W2-T13', 'W2-T44', 'W2b-T39',
  ]

  /** A reserved step is one whose whole command is the echo. A step that echoes it only where a file is missing (the content compile, prepare-pages, the labs) switches on by file, and is not reserved. */
  const reservedIn = (text: string) =>
    Object.entries((load(text) as Workflow).jobs ?? {}).flatMap(([job, { steps = [] }]) =>
      steps.flatMap((step) => {
        const task = new RegExp(`^echo ['"]pending: (${TASK_ID})['"]$`).exec(step.run?.trim() ?? '')?.[1]
        return task === undefined ? [] : [{ job, task }]
      }),
    )

  /** The tasks that `tracker` marks done or in review and that the list above lacks: what the marker guard is to find none of. */
  const unlisted = (tracker: string) => markedTasks(tracker, 'x=').filter((task) => !MERGED.includes(task))

  test('none names a task that has merged: the task has landed, and its step is a check that nobody built', () => {
    const reserved = [...sources].flatMap(([file, source]) => reservedIn(source).map(({ job, task }) => ({ file, job, task })))
    // The link-rot report waits for W3-T13. The grader's receipt fixtures waited for W2-T08, which built the step.
    expect(reserved.map(({ task }) => task).sort()).toEqual(expect.arrayContaining(['W3-T13']))
    expect(reserved.filter(({ task }) => MERGED.includes(task)).map(({ file, job, task }) => `${file}/${job} still prints "pending: ${task}", and ${task} has merged: build the step`)).toEqual([])
  })

  test('would find one: a job whose only step prints the pending line of a merged task', () => {
    const stale = "jobs:\n  properties:\n    steps:\n      - run: \"echo 'pending: W0-T10'\"\n  reports:\n    steps:\n      - run: |\n          if [ -f scripts/content/build.ts ]; then bun scripts/content/build.ts; else echo 'pending: W0-T08'; fi\n      - run: \"echo 'pending: W3-T13'\"\n"
    expect(reservedIn(stale)).toEqual([
      { job: 'properties', task: 'W0-T10' },
      { job: 'reports', task: 'W3-T13' },
    ])
    expect(reservedIn(stale).filter(({ task }) => MERGED.includes(task))).toEqual([{ job: 'properties', task: 'W0-T10' }])
  })

  test('the list names tasks that TRACKER.md has, once each', () => {
    const tasks = trackerTasks()
    expect(MERGED.filter((task) => !tasks.has(task))).toEqual([])
    expect(new Set(MERGED).size).toBe(MERGED.length)
  })

  test('has every task that TRACKER.md marks done or in review', () => {
    const marked = markedTasks(read('docs/TRACKER.md'), 'x=')
    expect(marked.length).toBeGreaterThan(20)
    expect(marked.filter((task) => !MERGED.includes(task))).toEqual([])
  })

  describe("W1b's ids, which the patterns before the close-out did not read (W1b-report §10)", () => {
    const tracker = read('docs/TRACKER.md')

    test("every task of the tracker's W1b section is read by the pattern, and the guard finds each one that is marked on the list", () => {
      const section = between(tracker, '\n## W1b: ', '\n## W2: ')
      const headings = [...section.matchAll(/^#### \[(.)\] (\S+) · /gm)].map((match) => ({ marker: match[1], id: match[2] }))
      // W1b built sixteen tasks. Every heading of the section has an id of its wave that the pattern reads, and the pattern misses none.
      expect(headings.length).toBeGreaterThanOrEqual(16)
      expect(headings.filter(({ id }) => !id.startsWith('W1b-T'))).toEqual([])
      expect(taskHeadings(section)).toEqual(headings)
      // The exit review marked them `[=]`, so the guard has them to look for: it finds them marked, and none missing from the list.
      expect(markedTasks(section, 'x=').length).toBeGreaterThanOrEqual(16)
      expect(unlisted(section)).toEqual([])
    })

    test("would find a task of W1b that is marked and not on the list: the pattern of before read none of W1b's ids", () => {
      const stale = '## W1b: carry-over\n\n#### [=] W1b-T05 · TR5a item families · M · sonnet\n\n#### [ ] W1b-T06 · TR8 item families · M · sonnet\n\n#### [x] W1b-T99 · A task that is not on the list · S · sonnet\n'
      expect([...stale.matchAll(/^#### \[([x=])\] (W\d-T\d\d) · /gm)]).toEqual([])
      expect(markedTasks(stale, 'x=')).toEqual(['W1b-T05', 'W1b-T99'])
      expect(unlisted(stale)).toEqual(['W1b-T99'])
    })

    test('would find a reserved step that names a task of W1b, once that task has merged', () => {
      const stale = "jobs:\n  labs:\n    steps:\n      - run: \"echo 'pending: W1b-T08'\"\n  reports:\n    steps:\n      - run: \"echo 'pending: W3-T13'\"\n"
      expect(/^echo ['"]pending: (W\d-T\d\d)['"]$/.exec("echo 'pending: W1b-T08'")).toBeNull()
      expect(reservedIn(stale)).toEqual([
        { job: 'labs', task: 'W1b-T08' },
        { job: 'reports', task: 'W3-T13' },
      ])
      expect(reservedIn(stale).filter(({ task }) => MERGED.includes(task))).toEqual([{ job: 'labs', task: 'W1b-T08' }])
    })
  })
})

describe('no test file reads a build output that the unit job never makes (tests/ci/pristine.ts)', () => {
  test('every file under tests/ that reads one makes it first', () => {
    expect(readersWithoutProducer(testSources())).toEqual([])
  })

  test('it fails on the stems test as it was: a readdirSync of src/content/generated/lessons and nothing that makes it', () => {
    expect(readersWithoutProducer({ 'tests/items/stems.test.ts': SAMPLES.stems })).toEqual(['tests/items/stems.test.ts'])
  })

  test('it fails on a read of public/claims.json or of dist/ from the repo root, and passes on one that builds, or compiles in memory, or only mentions it', () => {
    expect(readersWithoutProducer({ a: SAMPLES.claims, b: SAMPLES.dist })).toEqual(['a', 'b'])
    expect(readersWithoutProducer({ a: `${SAMPLES.claims}\nviteBuild(out, '/')`, b: `${SAMPLES.dist}\nconst scratch = mkdtempSync('x')` })).toEqual([])
    expect(readersWithoutProducer({ a: SAMPLES.inMemory, b: SAMPLES.commented })).toEqual([])
  })
})
