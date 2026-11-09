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
import { between, read, root } from '../ci/support'

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
