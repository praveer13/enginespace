/*
 * The Markdown export names a lesson's Test as a Test (scripts/content/directives.ts, build.ts): an item block under the lesson's last
 * `##` reads "Test.", and no other block does. Over the committed export of every module.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { repo } from './support.ts'

const md = path.join(repo, 'public/md')
const lessons = readdirSync(md, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((dir) =>
    readdirSync(path.join(md, dir.name))
      .filter((file) => file.endsWith('.md'))
      .map((file) => ({ name: `${dir.name}/${file}`, text: readFileSync(path.join(md, dir.name, file), 'utf8') })),
  )

/** A lesson's text with its fenced code blocks removed, split into the parts that start at a `##` line. */
const partsOf = (text: string): string[] => text.replace(/^```[\s\S]*?^```/gm, '').split(/^## /m)

describe('the export names a Test as a Test', () => {
  test('the export has lessons', () => expect(lessons.length).toBeGreaterThan(10))

  test('every item block under a lesson\'s last ## reads "Test.", and every other item block reads "Practice."', () => {
    for (const { name, text } of lessons) {
      const parts = partsOf(text).filter((part) => !part.startsWith('Claims cited'))
      const last = parts.length - 1
      parts.forEach((part, at) => {
        for (const line of part.split('\n').filter((l) => /^> \*\*(Test|Practice)\.\*\* Items from/.test(l))) {
          const label = at === last && at > 0 ? 'Test' : 'Practice'
          expect(line.startsWith(`> **${label}.**`), `${name}: ${line.slice(0, 60)}`).toBe(true)
        }
      })
    }
  })

  test('no other block is named Test', () => {
    for (const { name, text } of lessons) for (const line of text.split('\n').filter((l) => /^> \*\*Test\./.test(l))) expect(line, name).toContain('Items from the generator family')
  })
})
