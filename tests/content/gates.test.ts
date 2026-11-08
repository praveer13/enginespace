/*
 * verify:content, verify:claims and verify:numbers as commands, through the gate registry (W0-T04) that CI and `npm run verify:*`
 * use. Each gate prints the problems that are its own, as file:line, and fails only on an error.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { GATES } from '../../scripts/verify.ts'
import { CLAIM_COUNT, CLAIMS, COURSE, LESSON, lineOf, project, REPO_CLAIM_COUNT, REPO_COUNTS, repo, readSample, swap } from './support.ts'
import type { Edit } from './support.ts'

function run(script: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [path.join(repo, script), ...args], { encoding: 'utf8' })
  return { status: result.status, out: result.stdout, err: result.stderr }
}
const gate = (name: 'content' | 'claims' | 'numbers', root: string) => run(`scripts/verify-${name}.ts`, '--root', root)

describe('through the registry', () => {
  for (const name of ['content', 'claims', 'numbers'] as const) {
    test(`verify:${name} is wired to its script and passes on the repo`, () => {
      expect(GATES[name].parts.map((part) => part.script)).toEqual([`scripts/verify-${name}.ts`])
      expect(GATES[name].parts.map((part) => part.task)).toEqual(['W0-T08'])
      const result = run('scripts/verify.ts', name)
      expect(result.status).toBe(0)
      expect(result.out).toContain(`$ bun scripts/verify-${name}.ts`)
      expect(result.out).toContain(`verify:${name} passed: ${REPO_COUNTS}, ${REPO_CLAIM_COUNT} claims`)
      expect(result.out).not.toContain('pending')
    })
  }

  test('lists the three as live', () => {
    const { out } = run('scripts/verify.ts', 'list')
    for (const name of ['content', 'claims', 'numbers']) {
      expect(out.split('\n').find((line) => line.startsWith(`${name} `))).toMatch(new RegExp(`^${name} +source +live +W0-T08 +scripts/verify-${name}\\.ts$`))
    }
  })

  test('fails the registry\'s run when the content has an error', () => {
    // The registry runs a gate on the repo's own tree, so this is the gate's exit status carried through, tried on a copy.
    const root = project({ [LESSON]: swap('mode: practice', 'mode: practice\nspeed: 3') })
    const result = gate('content', root)
    expect(result.status).toBe(1)
  })
})

describe('each gate prints its own problems and passes on the others\'', () => {
  const trees: Record<string, { edits: Record<string, Edit>; gate: 'content' | 'claims' | 'numbers' }> = {
    structure: { edits: { [LESSON]: swap('mode: practice', 'mode: practice\nspeed: 3') }, gate: 'content' },
    number: { edits: { [LESSON]: swap('A lesson may also carry', 'A lesson may take 12 minutes to read. A lesson may also carry') }, gate: 'numbers' },
    claim: { edits: { [CLAIMS]: swap('value: 2.1', 'value: 2.2') }, gate: 'claims' },
  }
  for (const [what, { edits, gate: failing }] of Object.entries(trees)) {
    test(`a ${what} problem fails verify:${failing} alone`, () => {
      const root = project(edits)
      for (const name of ['content', 'claims', 'numbers'] as const) {
        const result = gate(name, root)
        expect([name, result.status]).toEqual([name, name === failing ? 1 : 0])
      }
    })
  }

  test('a tag with a date in it is a numbers problem', () => {
    const root = project({ [LESSON]: swap('can hide behind', 'can hide behind [measured 2026-11-03]') })
    const result = gate('numbers', root)
    expect(result.status).toBe(1)
    expect(result.out).toContain(`${LESSON}:${lineOf(readSample(LESSON), 'can hide behind')}: error bad-tag:`)
    expect(gate('content', root).status).toBe(0)
  })

  test('says what failed, and in how many files', () => {
    const root = project({
      [LESSON]: swap('mode: practice', 'mode: practice\nspeed: 3'),
      [COURSE]: swap('hours: 10 # [estimated]\n    hours_by_lane: { B: 10 } # [estimated]', 'hours: 11 # [estimated]\n    hours_by_lane: { B: 10 } # [estimated]'),
    })
    const result = gate('content', root)
    expect(result.out).toMatch(/verify:content failed: 2 errors in 2 files\n$/)
  })

  test('counts warnings without failing on them', () => {
    const root = project({ [LESSON]: swap('minutes: 45', 'minutes: 90') })
    const result = gate('content', root)
    expect(result.status).toBe(0)
    expect(result.out).toContain('warning minutes-drift')
    expect(result.out).toContain(`verify:content passed: 1 module, 1 lesson, ${CLAIM_COUNT} claims, 1 warning\n`)
  })

  test('has one error for a tree with no course.yaml', () => {
    const result = gate('content', project({ [COURSE]: null }))
    expect(result.status).toBe(1)
    expect(result.out).toContain('content/course.yaml:1: error missing-file:')
  })
})

describe('usage', () => {
  for (const name of ['content', 'claims', 'numbers']) {
    test(`verify-${name} refuses an unknown option and a --root with no folder`, () => {
      for (const args of [['--nope'], ['--root'], ['somewhere']]) {
        const result = run(`scripts/verify-${name}.ts`, ...args)
        expect([args, result.status]).toEqual([args, 2])
        expect(result.err).toContain(`usage: bun scripts/verify-${name}.ts [--root <dir>]`)
      }
    })
  }
})
