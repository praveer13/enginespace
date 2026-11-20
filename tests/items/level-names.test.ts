/*
 * The four level names are plain words: no term of the research they come from reaches a learner. Four screens show them, and the
 * list is held here, so that a fifth screen is a decision and not an accident.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LEVEL_NAMES, LEVELS } from '@es/play/items/types'

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))

describe('LEVEL_NAMES', () => {
  test('are the four plain words, one for each level', () => {
    expect(LEVELS.map((level) => LEVEL_NAMES[level])).toEqual(['worked example', 'part-worked', 'on your own', 'new setting'])
  })

  test('hold no jargon of the research', () => {
    for (const level of LEVELS) expect(LEVEL_NAMES[level]).not.toMatch(/faded|surface|scaffold|fading/i)
  })

  test('are shown on four screens: the waiting sheet and the empty line, a question header, and Today’s work', () => {
    const users = walk('src')
      .filter((file) => /\.tsx?$/.test(file) && readFileSync(file, 'utf8').includes('LEVEL_NAMES'))
      .sort()
    expect(users).toEqual(['src/items/Attempt.tsx', 'src/items/ItemBlock.tsx', 'src/items/today/Work.tsx'])
  })
})
