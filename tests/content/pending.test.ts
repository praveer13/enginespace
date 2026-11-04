/*
 * A block whose feature a later task builds renders a placeholder that names that task (W0-T09). The names are written in
 * src/content/render/model.ts, and a wrong one would send a reader, or the agent that replaces the placeholder, to the wrong
 * task. So these tests read docs/TRACKER.md itself: each task named there must exist, and its title or body must be about
 * the feature, the game or the lab it stands for.
 */
import { describe, expect, test } from 'bun:test'
import { GAME_IDS, LAB_IDS } from '../../scripts/content/directives.ts'
import { GAME_TASKS, LAB_TASKS, PENDING, pendingGame, pendingLab } from '@/content/render/model'
import { trackerTasks } from '../ci/support.ts'

const tasks = trackerTasks()
/** A task's heading line: `#### [ ] W1-T13 · Service (`loop`): TR2's levels · L · sonnet · deps: …`. */
const heading = (id: string) => tasks.get(id)?.split('\n', 1)[0] ?? ''

describe('the features that are not built yet', () => {
  /** Each feature, the words of the tracker that say which task builds it, and where those words are. */
  const features: Record<keyof typeof PENDING, { in: 'heading' | 'body'; words: RegExp }> = {
    predict: { in: 'body', words: /prediction first/ },
    item: { in: 'heading', words: /item block/ },
    trace: { in: 'heading', words: /Trace viewer/ },
    'notional-machine': { in: 'heading', words: /Notional-machine cards/ },
    'in-production': { in: 'body', words: /In-production card/ },
    'build-this': { in: 'body', words: /Build-this card/ },
    change: { in: 'heading', words: /Change cards/ },
  }

  test('the table names every feature once, and no task that the tracker lacks', () => {
    expect(Object.keys(PENDING).sort()).toEqual(Object.keys(features).sort())
    for (const { task } of Object.values(PENDING)) expect(tasks.has(task)).toBe(true)
  })

  test.each(Object.entries(features))('%s is built by the task whose text says so', (name, feature) => {
    const { task } = PENDING[name as keyof typeof PENDING]
    const text = feature.in === 'heading' ? heading(task) : (tasks.get(task) ?? '')
    expect(text).toMatch(feature.words)
  })
})

describe('the games', () => {
  test('every game of the roster has a task, and no task is named for a game that is not there', () => {
    expect(Object.keys(GAME_TASKS).sort()).toEqual([...GAME_IDS].sort())
  })

  test.each(Object.entries(GAME_TASKS))('%s is built by %s, whose title names it', (game, task) => {
    expect(heading(task)).toContain(`(\`${game}\`)`)
  })

  test('a game that is not listed falls back to the game framework, and so does a name every object has', () => {
    expect(pendingGame('loop').task).toBe(GAME_TASKS.loop)
    for (const name of ['not-a-game', 'constructor', 'toString']) expect(heading(pendingGame(name).task)).toContain('Game framework')
  })
})

describe('the labs', () => {
  /** The words of each lab's task title: a forge lab by its id, a laptop or GPU lab by its module and what it does. */
  const titles: Record<string, RegExp> = {
    'hybrid-kv': /Forge lab `hybrid-kv`/,
    'rejection-sampler': /Forge lab `rejection-sampler`/,
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

  test('every lab the compiler knows has a task, and no task is named for a lab that is not there', () => {
    expect(Object.keys(LAB_TASKS).sort()).toEqual([...LAB_IDS].sort())
    expect(Object.keys(titles).sort()).toEqual([...LAB_IDS].sort())
  })

  test.each(Object.entries(LAB_TASKS))('%s is built by %s, whose title says so', (lab, task) => {
    expect(heading(task)).toMatch(titles[lab])
  })

  test('a lab that is not listed falls back to the forge host, and so does a name every object has', () => {
    expect(pendingLab('tr3.profile').task).toBe(LAB_TASKS['tr3.profile'])
    for (const name of ['not-a-lab', 'constructor', '__proto__']) expect(heading(pendingLab(name).task)).toContain('Forge host')
  })
})
