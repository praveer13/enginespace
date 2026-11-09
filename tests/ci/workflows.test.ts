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
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { GATE_NAMES, GATES } from '../../scripts/verify'
import { BUN_FALLBACK, backticked, between, read, root, tableRows, trackerTasks } from './support'

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
  stepsOf(file, job).flatMap((step) => (step.run === undefined || step.if === BUN_FALLBACK ? [] : [step.run.trim()]))
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
  test('runs on pull requests, and has the jobs fast-gate, tests and e2e-smoke', () => {
    expect(Object.keys(workflow('ci.yml').on ?? {})).toContain('pull_request')
    expect(jobsOf('ci.yml').map(([name]) => name)).toEqual(expect.arrayContaining(['fast-gate', 'tests', 'e2e-smoke']))
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

  test('the tests job installs and runs the suite', () => {
    expect(runsOf('ci.yml', 'tests')).toEqual(['npm ci', 'bun run test'])
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
    const reviewed = [...runsOf('ci.yml', 'fast-gate'), ...runsOf('ci.yml', 'tests')]
    expect(reviewed.filter((run) => !deployed.has(run))).toEqual([])
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
  test('runs for a change under labs/, schemas/, packages/schema/ or packages/verify/, and by hand', () => {
    const on = workflow('labs.yml').on as { pull_request?: { paths?: string[] }; workflow_dispatch?: unknown }
    expect(on.pull_request?.paths).toEqual(['labs/**', 'schemas/**', 'packages/schema/**', 'packages/verify/**', '.github/workflows/labs.yml'])
    expect('workflow_dispatch' in on).toBe(true)
  })

  test('has the forge and grader jobs, each switched on by the lab it tests', () => {
    const jobs = Object.fromEntries(jobsOf('labs.yml'))
    expect(Object.keys(jobs)).toEqual(expect.arrayContaining(['detect', 'forge', 'grader']))
    expect([jobs.forge.needs, jobs.forge.if]).toEqual(['detect', "needs.detect.outputs.forge == 'true'"])
    expect([jobs.grader.needs, jobs.grader.if]).toEqual(['detect', "needs.detect.outputs.grader == 'true'"])
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
})

describe('reserved steps', () => {
  test('each prints "pending: <task>" with a task that TRACKER.md has', () => {
    const tasks = trackerTasks()
    const reserved = [...sources].flatMap(([file, source]) => [...source.matchAll(/echo ['"]pending: ([^'"]+)['"]/g)].map((match) => ({ file, task: match[1] })))
    // Seven are left [measured 2026-11-08 at the wave-1 tip 76eb3fd, with W1-T35's change]: the content compile of ci.yml and of deploy.yml
    // (W0-T08), prepare-pages (W0-T19), the labs' two (W1-T10, W2-T02), the grader's receipt fixtures (W2-T08) and the link-rot report
    // (W3-T13). The Export freshness step of both workflows had one more each, until W1-T35 built the check, so the count that stood here,
    // more than eight, could not hold. The list is exact, so a step that is added or built changes it in the same commit.
    expect(reserved.map(({ task }) => task).sort()).toEqual(['W0-T08', 'W0-T08', 'W0-T19', 'W1-T10', 'W2-T02', 'W2-T08', 'W3-T13'])
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
  ]

  /** A reserved step is one whose whole command is the echo. A step that echoes it only where a file is missing (the content compile, prepare-pages, the labs) switches on by file, and is not reserved. */
  const reservedIn = (text: string) =>
    Object.entries((load(text) as Workflow).jobs ?? {}).flatMap(([job, { steps = [] }]) =>
      steps.flatMap((step) => {
        const task = /^echo ['"]pending: (W\d-T\d\d)['"]$/.exec(step.run?.trim() ?? '')?.[1]
        return task === undefined ? [] : [{ job, task }]
      }),
    )

  test('none names a task that has merged: the task has landed, and its step is a check that nobody built', () => {
    const reserved = [...sources].flatMap(([file, source]) => reservedIn(source).map(({ job, task }) => ({ file, job, task })))
    // The link-rot report waits for W3-T13, and the grader's receipt fixtures for W2-T08.
    expect(reserved.map(({ task }) => task).sort()).toEqual(expect.arrayContaining(['W2-T08', 'W3-T13']))
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
    const marked = [...read('docs/TRACKER.md').matchAll(/^#### \[([x=])\] (W\d-T\d\d) · /gm)].map((match) => match[2])
    expect(marked.length).toBeGreaterThan(20)
    expect(marked.filter((task) => !MERGED.includes(task))).toEqual([])
  })
})
