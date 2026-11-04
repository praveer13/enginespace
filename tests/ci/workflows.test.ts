/*
 * W0-T04's workflows, .github/workflows/*.yml, against ARCHITECTURE §10 and the registry in scripts/verify.ts.
 *
 * A workflow cannot run here, so these tests hold what a run would otherwise show:
 *   - every workflow file parses with js-yaml (acceptance 5), and a duplicate key is an error;
 *   - every action is pinned by full SHA with §10.3's release in the comment, jobs default to `contents: read`, only the
 *     jobs that need more widen it, and every checkout drops its credentials (acceptance 1);
 *   - deploy.yml builds under /enginespace/ on pushes to main only, behind PAGES_ENABLED (acceptance 3);
 *   - nightly.yml opens or updates one nightly-failure issue when a job fails (acceptance 4);
 *   - every gate of the registry runs in some workflow, and the fast gate runs them in the order that works: the source
 *     gates, the build, then the gates that read it;
 *   - a step that is reserved for a later task says "pending: <task>", with a task that TRACKER.md has.
 * What these tests cannot see is the syntax of expressions, the contexts they read and the shell in `run`. `actionlint`, with
 * shellcheck on the PATH, checks those over .github/workflows. It is not a dependency, so run it by hand when a workflow changes.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { GATE_NAMES, GATES } from '../../scripts/verify'
import { backticked, between, read, root, tableRows, trackerTasks } from './support'

interface Step {
  name?: string
  id?: string
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
const runsOf = (file: string, job: string) => stepsOf(file, job).flatMap((step) => (step.run === undefined ? [] : [step.run.trim()]))
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
  test('runs on pushes to main and nothing else', () => {
    expect(workflow('deploy.yml').on).toEqual({ push: { branches: ['main'] } })
  })

  test('both jobs wait for PAGES_ENABLED, which stays unset until the owner answers O-2', () => {
    expect(jobsOf('deploy.yml').map(([name, job]) => [name, job.if])).toEqual([
      ['build', "vars.PAGES_ENABLED == 'true'"],
      ['deploy', "vars.PAGES_ENABLED == 'true'"],
    ])
  })

  test('builds under /enginespace/, and prepares the Pages directory under it too', () => {
    const steps = stepsOf('deploy.yml', 'build')
    for (const command of ['npm run build', 'scripts/prepare-pages.ts']) {
      const step = steps.find((candidate) => candidate.run?.includes(command))
      expect([command, step?.env]).toEqual([command, { VITE_BASE: '/enginespace/' }])
    }
    // Nothing else sees the Pages base: the gates run as they do in ci.yml.
    expect(steps.filter((step) => step.env?.VITE_BASE !== undefined).length).toBe(2)
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
    expect(reserved.length).toBeGreaterThan(8)
    expect(reserved.filter(({ task }) => !tasks.has(task))).toEqual([])
  })
})
