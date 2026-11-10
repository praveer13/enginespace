/*
 * A block whose feature a later task builds renders a placeholder that names that task (W0-T09). The names are written in
 * src/content/render/model.ts, and a wrong one would send a reader, or the agent that replaces the placeholder, to the wrong
 * task. So these tests read docs/TRACKER.md itself: each task named there must exist, and its title or body must be about
 * the feature, the game or the lab it stands for.
 */
import { describe, expect, test } from 'bun:test'
import { GAME_IDS, LAB_IDS } from '../../scripts/content/directives.ts'
import { BUILT_LABS, GAME_TASKS, LAB_TASKS, PENDING, pendingGame, pendingLab } from '@/content/render/model'
import { FORGE_LAB_IDS } from '@/forge/ids'
import { resolveGame } from '@/games/registry'
import { trackerTasks } from '../ci/support.ts'

const tasks = trackerTasks()
/** A task's heading line: `#### [ ] W1-T13 · Service (`loop`): TR2's levels · L · sonnet · deps: …`. */
const heading = (id: string) => tasks.get(id)?.split('\n', 1)[0] ?? ''

describe('the features that are not built yet', () => {
  /** Each feature, the words of the tracker that say which task builds it, and where those words are. */
  const features: Record<keyof typeof PENDING, { in: 'heading' | 'body'; words: RegExp }> = {
    trace: { in: 'body', words: /The `trace` block/ },
    'in-production': { in: 'body', words: /The In-production card/ },
    'build-this': { in: 'body', words: /The Build-this card/ },
    change: { in: 'heading', words: /Change cards/ },
  }

  test('the table names every feature once, and no task that the tracker lacks', () => {
    expect(Object.keys(PENDING).sort()).toEqual(Object.keys(features).sort())
    for (const { task } of Object.values(PENDING)) expect(tasks.has(task)).toBe(true)
  })

  test('the prediction box is built (W1b-T02), so it is no placeholder: a prediction that no run answers names its own task (packages/play/predictions/plan.ts)', () => {
    expect(Object.keys(PENDING)).not.toContain('predict')
  })

  test.each(Object.entries(features))('%s is built by the task whose text says so', (name, feature) => {
    const { task } = PENDING[name as keyof typeof PENDING]
    const text = feature.in === 'heading' ? heading(task) : (tasks.get(task) ?? '')
    expect(text).toMatch(feature.words)
  })

  test.each(Object.entries(PENDING))('%s waits for %s, which is still open: its marker is [ ] or [~], not [=] or [x] (W1b-T02, acceptance 4)', (_name, { task }) => {
    expect(heading(task)).toMatch(/^#### \[[ ~]\] /)
  })
})

describe('the games', () => {
  /** The games this build has: a lesson's block plays them (W1b-T01). */
  const built = GAME_IDS.filter((id) => resolveGame(id).kind === 'game')

  test('every game of the roster is built or has a task, never both, and no task is named for a game that is not there', () => {
    expect([...built, ...Object.keys(GAME_TASKS)].sort()).toEqual([...GAME_IDS].sort())
    expect(built.filter((id) => Object.hasOwn(GAME_TASKS, id))).toEqual([])
    // W1 built five games, and a lesson's block of each plays it.
    expect([...built].sort()).toEqual(['broken-bench', 'engine-floor', 'loop', 'pool', 'verifier'])
  })

  test.each(Object.entries(GAME_TASKS))('%s is built by %s, whose title names it', (game, task) => {
    expect(heading(task)).toContain(`(\`${game}\`)`)
  })

  test.each(Object.entries(GAME_TASKS))('%s waits for %s, which is still open: its marker is [ ] or [~], not [=] or [x] (W1b-T01, acceptance 6)', (_game, task) => {
    expect(heading(task)).toMatch(/^#### \[[ ~]\] /)
  })

  test('a game that is built, and a name that is no game, name no task; a name every object has is not a game', () => {
    for (const name of [...built, 'not-a-game', 'constructor', 'toString']) expect([name, pendingGame(name)]).toEqual([name, null])
    expect(pendingGame('switchyard')).toEqual({ task: GAME_TASKS.switchyard, what: 'the game' })
  })
})

describe('the labs', () => {
  /** The words of each lab's task title, for the labs that have no page yet: a forge lab by its id, a laptop or GPU lab by its module and what it does. */
  const titles: Record<string, RegExp> = {
    'kv-publisher': /Forge lab `kv-publisher`/,
    'tr0.forward': /TR0 lab: the Qwen3-0\.6B forward pass/,
    'tr1.fork': /TR1 lab: a nano-vllm fork/,
    'tr3.profile': /TR3 lab: profile vLLM/,
    'tr4.sweep': /TR4 lab: backend sweeps/,
    'tr5b.connector': /TR5b lab: a toy connector/,
    'tr6.proposer': /TR6 lab: a proposer/,
    'tr7.reproduce': /TR7 lab: reproduce a published number/,
    'tr8.replay': /TR8 lab: BurstGPT open-loop replay/,
    'capstone.pair': /Capstone harness/,
  }

  test('every lab the compiler knows is built or has a task, never both, and no task is named for a lab that is not there', () => {
    expect([...BUILT_LABS, ...Object.keys(LAB_TASKS)].sort()).toEqual([...LAB_IDS].sort())
    expect(BUILT_LABS.filter((id) => Object.hasOwn(LAB_TASKS, id))).toEqual([])
    expect(Object.keys(titles).sort()).toEqual(Object.keys(LAB_TASKS).sort())
  })

  test('the labs that are built are the forge labs that have a host, so their page works and their ticket needs no task', () => {
    for (const id of BUILT_LABS) expect([id, FORGE_LAB_IDS.includes(id)]).toEqual([id, true])
    for (const id of FORGE_LAB_IDS.filter((candidate) => LAB_IDS.includes(candidate))) expect([id, BUILT_LABS.includes(id)]).toEqual([id, true])
  })

  test.each(Object.entries(LAB_TASKS))('%s is built by %s, whose title says so', (lab, task) => {
    expect(heading(task)).toMatch(titles[lab])
  })

  test.each(Object.entries(LAB_TASKS))('%s waits for %s, which is still open: its marker is [ ] or [~], not [=] or [x] (W1b-T02, acceptance 4)', (_lab, task) => {
    expect(heading(task)).toMatch(/^#### \[[ ~]\] /)
  })

  test('a lab that has no page yet names its task, and a lab that is built, and a name that is no lab, name none', () => {
    expect(pendingLab('tr3.profile')).toEqual({ task: LAB_TASKS['tr3.profile'], what: 'the lab' })
    for (const name of [...BUILT_LABS, 'not-a-lab', 'constructor', '__proto__']) expect([name, pendingLab(name)]).toEqual([name, null])
  })
})
