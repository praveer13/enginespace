/*
 * W0-T23's acceptance checks, as tests.
 *
 *   1. AGENTS.md carries every rule of the agent brief in docs/TRACKER.md, in the tracker's words and order. The tracker stays
 *      the source: when the brief changes, these tests fail until AGENTS.md says the same. That covers the worktree and merge
 *      rules (1, 2 and 10) with the rest.
 *   2. The commands that README.md and AGENTS.md give name scripts and files that exist, and their links resolve, so a renamed
 *      script or a moved document fails here before it strands a reader. That the commands run as written is shown by running
 *      them on a clean clone; CI runs the same ones on every pull request.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { between, read, root, tasksIn } from '../ci/support'

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

interface Rule {
  /** "1. Base." */
  name: string
  /** The rule as the tracker writes it, with its sub-bullets, squashed onto one line. */
  text: string
}

/** The rules of the tracker's agent brief: each top-level numbered item with its sub-bullets. */
function briefRules(): Rule[] {
  const brief = between(read('docs/TRACKER.md'), '## The agent brief: rules for every task', '\n## ')
  const rules: string[][] = []
  for (const line of brief.split('\n')) {
    if (/^\d+\. /.test(line)) rules.push([line])
    else rules.at(-1)?.push(line)
  }
  return rules.map((lines) => {
    const text = squash(lines.join('\n'))
    return { name: /^\d+\. \*\*(.+?)\*\*/.exec(text)?.[0].replaceAll('*', '') ?? text.slice(0, 40), text }
  })
}

describe("AGENTS.md carries the tracker's agent brief", () => {
  const rules = briefRules()
  const agents = squash(read('AGENTS.md'))

  test('the brief parses into rules numbered from 1', () => {
    expect(rules.length).toBeGreaterThanOrEqual(10)
    expect(rules.map((rule) => Number.parseInt(rule.name, 10))).toEqual(rules.map((_, index) => index + 1))
  })

  for (const rule of rules) {
    test(`rule ${rule.name}`, () => {
      if (!agents.includes(rule.text)) {
        throw new Error(`AGENTS.md no longer carries rule ${rule.name} of docs/TRACKER.md's agent brief word for word: copy the rule from the tracker`)
      }
    })
  }

  test("in the tracker's order", () => {
    const places = rules.map((rule) => agents.indexOf(rule.text))
    expect(places).toEqual([...places].sort((a, b) => a - b))
  })
})

const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts

/** The commands that a document gives: the lines of its sh blocks, and the inline code that starts like one, without comments. */
function commandsIn(markdown: string): string[] {
  const blocks = [...markdown.matchAll(/^```(?:sh|bash)\n([\s\S]*?)^```/gm)].flatMap((block) => block[1].split('\n'))
  const spans = [...markdown.matchAll(/`([^`\n]+)`/g)].map((span) => span[1])
  return [...blocks, ...spans].map((line) => line.replace(/\s+#.*$/, '').trim()).filter((line) => /^(\w+=\S+ )*(npm|bun) \S/.test(line))
}

/** What is wrong with an npm or bun command, or undefined when it names a script or a file that exists. */
function problemWith(command: string): string | undefined {
  const [tool, first, second] = command.replace(/^(\w+=\S+ )+/, '').split(/\s+/)
  const placeholder = (word: string) => /[<*]/.test(word)
  const script = (name: string) => (placeholder(name) || Object.hasOwn(scripts, name) ? undefined : `package.json has no script "${name}"`)
  if (tool === 'npm') return first === 'ci' ? undefined : script(first === 'run' ? second : first)
  if (first === 'test') return undefined
  if (first === 'run') return script(second)
  return placeholder(first) || existsSync(path.join(root, first)) ? undefined : `${first} does not exist`
}

for (const file of ['README.md', 'AGENTS.md']) {
  describe(`${file}'s commands and links`, () => {
    const text = read(file)

    test('every npm and bun command names a script or a file that exists', () => {
      const commands = commandsIn(text)
      expect(commands.length).toBeGreaterThan(0)
      const problems = commands.flatMap((command) => {
        const problem = problemWith(command)
        return problem === undefined ? [] : [`${command}: ${problem}`]
      })
      expect(problems).toEqual([])
    })

    test('every link to a file or folder of the repository resolves', () => {
      const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((link) => link[1].split('#')[0])
      const targets = links.filter((target) => target !== '' && !/^[a-z]+:/.test(target))
      expect(targets.length).toBeGreaterThan(0)
      expect(targets.filter((target) => !existsSync(path.join(root, target)))).toEqual([])
    })
  })
}

/*
 * R-T01: the records wave R stands on (D-062 to D-068), and the tracker's wave R section, which carries docs/waves/wr-tasks.json.
 */
describe("wave R's records", () => {
  const decisions = read('docs/DECISIONS.md')
  const WAVE_R = ['D-062', 'D-063', 'D-064', 'D-065', 'D-066', 'D-067', 'D-068']
  const FIELDS = ['Status', 'Decision', 'Context', 'Alternatives', 'Consequences', 'Revisit when']
  /** A record's text, from its heading to the next heading of its level or above. */
  const record = (id: string) => {
    const start = decisions.indexOf(`### ${id} · `)
    if (start < 0) return ''
    const next = decisions.slice(start + 4).search(/\n#{2,3} /)
    return next < 0 ? decisions.slice(start) : decisions.slice(start, start + 4 + next)
  }

  for (const id of WAVE_R) {
    test(`${id} carries the six fields, is proposed, and has a row in the index`, () => {
      const text = record(id)
      expect(text.length).toBeGreaterThan(0)
      for (const field of FIELDS) expect([field, text.includes(`- **${field}:**`)]).toEqual([field, true])
      expect(text).toMatch(/- \*\*Status:\*\* proposed \(wave R, 2026-11-15\)/)
      expect(text).not.toMatch(/owner-decided|owner decided/)
      expect(decisions).toMatch(new RegExp(`^\\| ${id} \\| [^\\n]* \\| proposed \\(wave R\\)[^\\n]*\\|$`, 'm'))
    })
  }

  test("each record that is the owner's to confirm gives the default and what the wave does on each answer", () => {
    for (const id of ['D-062', 'D-066', 'D-067', 'D-068']) {
      const text = record(id)
      expect([id, text.includes("The owner's to confirm")]).toEqual([id, true])
      expect([id, /- \*\*On (each|the owner's) answer[^\n]*\n( {2}- [^\n]*\n){2,}/.test(text)]).toEqual([id, true])
      expect([id, text.includes('(the default')]).toEqual([id, true])
    }
    const cut = record('D-065')
    expect(cut).toContain("The cut of Request path's 3D scene is the owner's to confirm")
    expect(cut).toMatch(/- \*\*On the owner's answer about the cut\*\*/)
  })

  test("the Status paragraph names the records that are the owner's to confirm, and the cut in D-065", () => {
    const status = /^\*\*Status:\*\* [^\n]*$/m.exec(decisions)?.[0] ?? ''
    expect(status).toContain("D-062, D-066, D-067 and D-068 are the owner's to confirm, and so is the cut of one 3D game (Request path's scene) in D-065")
  })

  test('D-062 deletes nothing of the kitchen before the look gate, and says what the wave does if the owner keeps The Pass', () => {
    const text = record('D-062')
    expect(text).toContain('Nothing of the kitchen is deleted before the look gate.')
    expect(text).toContain('**The Pass:** the wave continues from stage 1.')
    expect(text).toContain('stage 4 shrinks to R-T43, R-T45 and R-T46')
  })

  test('D-047, D-049 and D-050 are marked superseded with a pointer, and none is deleted', () => {
    for (const [id, by] of [['D-047', 'D-062'], ['D-049', 'D-063'], ['D-050', 'D-064']]) {
      const status = /- \*\*Status:\*\*[^\n]*/.exec(record(id))?.[0] ?? ''
      expect([id, status.includes(`uperseded by ${by}`)]).toEqual([id, true])
      expect([id, record(id).includes('- **Decision:**')]).toEqual([id, true])
      expect(decisions).toMatch(new RegExp(`^\\| ${id} \\|[^\\n]*superseded by ${by}[^\\n]*\\|$`, 'm'))
    }
  })
})

describe("the tracker's wave R section", () => {
  const tracker = read('docs/TRACKER.md')
  const section = between(tracker, '## WR: ', '\n---\n')
  const plan = JSON.parse(read('docs/waves/wr-tasks.json')) as { id: string; title: string; size: string; model: string; deps: string[]; files: string[]; goal: string; accept: string[] }[]
  /** The six stages of REDESIGN §8 and D-068, each with its first and last task. */
  const STAGES: [number, number, number][] = [[0, 1, 3], [1, 4, 15], [2, 16, 20], [3, 21, 40], [4, 41, 46], [5, 47, 50]]

  test('holds the six stages in order, each with its tasks', () => {
    const stages = [...section.matchAll(/^### Stage (\d): /gm)].map((match) => Number(match[1]))
    expect(stages).toEqual([0, 1, 2, 3, 4, 5])
    for (const [stage, first, last] of STAGES) {
      const text = between(`${section}\u0000`, `### Stage ${stage}: `, stage === 5 ? '\u0000' : `### Stage ${stage + 1}: `)
      const ids = [...text.matchAll(/^#### \[.\] (R-T\d\d) · /gm)].map((match) => match[1])
      const expected = Array.from({ length: last - first + 1 }, (_, at) => `R-T${String(first + at).padStart(2, '0')}`)
      expect([stage, ids]).toEqual([stage, expected])
    }
  })

  test("carries each task's goal, files and accept list in full from wr-tasks.json", () => {
    const tasks = tasksIn(section)
    expect([...tasks.keys()]).toEqual(plan.map((task) => task.id))
    for (const task of plan) {
      const text = tasks.get(task.id) ?? ''
      expect([task.id, text.includes(`- **Goal:** ${task.goal}\n`)]).toEqual([task.id, true])
      for (const file of task.files) expect([task.id, file, text.includes(`\`${file}\``)]).toEqual([task.id, file, true])
      task.accept.forEach((check, at) => expect([task.id, at, text.includes(`  ${at + 1}. ${check}\n`)]).toEqual([task.id, at, true]))
    }
  })
})
