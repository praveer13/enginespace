/*
 * W1b-T01, acceptance 1, the registry's half: every `game` block of the course's lessons names a game that this build has and a level of
 * it, and a graded block names a level that can be graded, so that each block starts its level in the lesson (GameBlock.tsx embeds
 * `src/games/<id>` at the block's level and mode). The browser's half, that each block does start its level, is
 * e2e/lesson-games.spec.ts.
 *
 * The blocks are read from what the compiler writes for `content/`, so a block added to a lesson is checked the day it is written.
 */
import { describe, expect, test } from 'bun:test'
import { compiledLessonSchema } from '@es/schema'
import type { CompiledBlock } from '@es/schema'
import { GAMES, levelOf } from '@es/play'
import { GAME_TASKS } from '@/content/render/model'
import { resolveGame } from '@/games/registry'
import { compileContent } from '../../scripts/content/build.ts'
import { repo } from './support.ts'

type GameBlock = Extract<CompiledBlock, { type: 'game' }>

const compiled = compileContent({ root: repo })
const lessons = compiled.outputs
  .filter((output) => output.path.startsWith('src/content/generated/lessons/'))
  .map((output) => compiledLessonSchema.parse(JSON.parse(output.text)))
const blocks = lessons.flatMap((lesson) => lesson.blocks.flatMap((block, at) => (block.type === 'game' ? [{ lesson: lesson.id, at, block: block as GameBlock }] : [])))

describe("the lessons' game blocks", () => {
  test('are there: W1 wrote at least 40 of them, across the lessons of its five modules', () => {
    expect(lessons.length).toBeGreaterThanOrEqual(27)
    expect(blocks.length).toBeGreaterThanOrEqual(40)
    expect(new Set(blocks.map(({ lesson }) => lesson.split('.')[0]))).toEqual(new Set(['tr1', 'tr2', 'tr5a', 'tr6', 'tr8']))
  })

  test('each names a game this build has, in both registries, and none that waits for a task', () => {
    const problems = blocks.flatMap(({ lesson, block }) => {
      if (resolveGame(block.id).kind !== 'game') return [`${lesson}: ${block.id} is not a game of this build`]
      if (Object.hasOwn(GAME_TASKS, block.id)) return [`${lesson}: ${block.id} is still listed as waiting for ${GAME_TASKS[block.id]}`]
      return []
    })
    expect(problems).toEqual([])
  })

  test('each names a level of its game, and a graded block a level that can be graded', () => {
    const problems = blocks.flatMap(({ lesson, block }) => {
      const game = GAMES.get(block.id)
      const level = game === undefined ? undefined : levelOf(game, block.level)
      if (level === undefined) return [`${lesson}: ${block.id} has no level "${block.level}"`]
      if (block.mode === 'graded' && !level.graded) return [`${lesson}: ${block.id}/${block.level} is graded in the lesson and cannot be graded`]
      return []
    })
    expect(problems).toEqual([])
  })

  test('two blocks of one lesson never name the same game, level and mode, so each embed is named apart from the others (GameShell)', () => {
    const seen = new Set<string>()
    const twice = blocks.flatMap(({ lesson, block }) => {
      const key = `${lesson} ${block.id}/${block.level}/${block.mode}`
      if (seen.has(key)) return [key]
      seen.add(key)
      return []
    })
    expect(twice).toEqual([])
  })
})
