/*
 * The module test kit (W2b-T18): the checks that every built module's test runs, once, so that a module's test calls `moduleKit` with what is
 * its own (its files, its titles, its model tables) and a later module gets the same checks by one call. The checks are those that the TR8 and
 * TR6 tests ran by hand:
 *
 *   - the module, its lessons and its claims compile with no diagnostic, and no pacing allowance beyond the exact lines the call names;
 *   - every lesson has a prediction, a game or an item to play after it, and a Test whose questions are three, one of them at least numeric;
 *   - reading minutes fall within the tolerance of the declared minutes, and the lessons add up to the module's browser hours;
 *   - every KC of the module is taught by a lesson, and no lesson teaches another module's;
 *   - the lessons' titles are the brief's, in its order;
 *   - a game block names a built game and a built level of it, a graded block a level that grades, an item block a built family;
 *   - the claims rules: the schema's, a pin that the lockfile has, a source that is not a moving branch, a quote that is short, a derived claim
 *     with its formula, and every claim read by the module;
 *   - the module is the `course.yaml` entry;
 *   - the part that needs a laptop or a GPU is announced, and never faked.
 *
 * And one rule that is new: a model table is held. The kit finds every Markdown table of a module's lessons and cards whose header or caption
 * carries [synthetic] (a number the course's model printed), and fails unless the module's demos file holds that header row word for word, tags
 * included, and recomputes the rows the lesson prints. A lesson cannot print a model's table that nothing recomputes, and the demos file
 * cannot keep a table that no lesson prints.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { compiledLessonSchema, compiledModuleSchema } from '@es/schema'
import type { CompiledBlock, ProseFlow, ProseInline } from '@es/schema'
import { courseSchema } from '@es/schema/course'
import { lockFileSchema } from '@es/schema/lock'
import { GAMES } from '../../packages/play/registry'
import { fixedSeeds, isLevel, startAttempt } from '../../packages/play/items'
import { familyById } from '../../packages/play/items/registry'
import { MINUTES_TOLERANCE } from '../../scripts/content/build.ts'
import type { CompileResult } from '../../scripts/content/build.ts'
import { read, repo } from './support.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Model tables                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A table that the course's model printed and a demos file holds. `header` is the table's header row as the lesson writes it, tags included.
 * `rows` recomputes the body: one array of cells for each row, a cell being the text the lesson prints, or `null` for a cell of the lesson's own
 * words that no model computes.
 */
export interface ModelTable {
  readonly lesson: string
  readonly header: string
  readonly rows: () => readonly (readonly (string | null)[])[]
}

/** A table that a Markdown text holds, as its lines say it. */
export interface FoundTable {
  readonly header: string
  readonly rows: readonly (readonly string[])[]
  /** The paragraph above the table, which is its caption. */
  readonly caption: string
  /** The 1-based line of the header row. */
  readonly line: number
}

/** The cells of one table row: the text between the bars, trimmed. */
export function cellsOf(row: string): string[] {
  const inner = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''
  for (let at = 0; at < inner.length; at++) {
    const char = inner[at]
    if (char === '\\' && inner[at + 1] === '|') {
      cell += '\\|'
      at++
    } else if (char === '|') {
      cells.push(cell.trim())
      cell = ''
    } else cell += char
  }
  cells.push(cell.trim())
  return cells
}

const isSeparator = (line: string): boolean => /^\|[\s:|-]+\|$/.test(line.trim()) && line.includes('-')

/** Every Markdown table of a text, outside the fenced code, with its caption: the paragraph that ends on the line above it. */
export function findTables(text: string): FoundTable[] {
  const lines = text.split('\n')
  const found: FoundTable[] = []
  let fenced = false
  for (let at = 0; at < lines.length; at++) {
    if (/^\s*(```|~~~)/.test(lines[at])) fenced = !fenced
    if (fenced || !lines[at].trim().startsWith('|') || at + 1 >= lines.length || !isSeparator(lines[at + 1])) continue
    let end = at + 2
    while (end < lines.length && lines[end].trim().startsWith('|')) end++
    let start = at - 1
    while (start >= 0 && lines[start].trim() === '') start--
    let top = start
    while (top >= 0 && lines[top].trim() !== '') top--
    found.push({
      header: lines[at].trim(),
      rows: lines.slice(at + 2, end).map(cellsOf),
      caption: start < 0 ? '' : lines.slice(top + 1, start + 1).join(' '),
      line: at + 1,
    })
    at = end - 1
  }
  return found
}

/** The tables whose header or caption carries [synthetic]: the ones that the course's model printed. */
export const modelTablesOf = (text: string): FoundTable[] =>
  findTables(text).filter((table) => table.header.includes('[synthetic]') || table.caption.includes('[synthetic]'))

const sameRow = (printed: readonly string[], computed: readonly (string | null)[]): boolean =>
  printed.length === computed.length && printed.every((cell, at) => computed[at] === null || computed[at] === cell)

/**
 * What is wrong with the way a module holds its model tables, one sentence for each. `texts` are the module's lessons and cards by id, `held`
 * is the demos file's list and `demosText` the demos file itself, which has to carry each header row word for word.
 */
export function modelTableProblems(texts: readonly { readonly id: string; readonly text: string }[], held: readonly ModelTable[], demosText: string): string[] {
  const problems: string[] = []
  const matched = new Set<ModelTable>()
  for (const { id, text } of texts) {
    for (const table of modelTablesOf(text)) {
      const hold = held.find((one) => one.lesson === id && one.header === table.header)
      if (hold !== undefined) matched.add(hold)
      problems.push(...tableProblems(id, table, hold, demosText))
    }
  }
  for (const hold of held) if (!matched.has(hold)) problems.push(`the demos file holds a table that no lesson prints: ${hold.lesson} ${hold.header}`)
  return problems
}

/** What is wrong with one table that a lesson prints, given the hold that the demos file has for it (or none). */
export function tableProblems(id: string, table: FoundTable, hold: ModelTable | undefined, demosText: string): string[] {
  if (hold === undefined) return [`${id}:${table.line} prints a model table that its demos file does not hold: ${table.header}`]
  const problems: string[] = []
  if (!demosText.includes(hold.header)) problems.push(`${id}:${table.line} the demos file does not carry the header row word for word: ${table.header}`)
  const computed = hold.rows()
  if (computed.length !== table.rows.length)
    problems.push(`${id}:${table.line} prints ${table.rows.length} rows and the model recomputes ${computed.length}: ${table.header}`)
  table.rows.forEach((row, at) => {
    if (at < computed.length && !sameRow(row, computed[at]))
      problems.push(
        `${id}:${table.line + 2 + at} prints | ${row.join(' | ')} | and the model recomputes | ${computed[at].map((cell) => cell ?? '*').join(' | ')} |`,
      )
  })
  return problems
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the compiled prose                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function inlineText(nodes: readonly ProseInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text
        case 'em':
        case 'strong':
        case 'link':
          return inlineText(node.children)
        case 'claim':
          return `{{claim:${node.id}}}`
        case 'ks':
          return `{{${node.ref}}}`
        case 'tag':
          return `[${node.tag}]`
      }
    })
    .join('')
}

/** The blocks of a lesson from its `## Exit check` heading to the end: the prose after the heading, then every block that follows. */
function exitCheck(blocks: readonly CompiledBlock[]): { prose: ProseFlow[]; blocks: CompiledBlock[] } | null {
  for (let at = 0; at < blocks.length; at++) {
    const block = blocks[at]
    if (block.type !== 'prose') continue
    const heading = block.body.findIndex((flow) => flow.type === 'heading' && flow.depth === 2 && inlineText(flow.children) === 'Exit check')
    if (heading < 0) continue
    return {
      prose: block.body.slice(heading + 1),
      blocks: blocks.slice(at + 1),
    }
  }
  return null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The kit                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface ModuleKitSpec {
  /** `tr8`. */
  readonly id: string
  /** The compile of the repository, which the module's test has already made. */
  readonly result: CompileResult
  readonly lessonFiles: readonly string[]
  readonly moduleFile: string
  readonly claimsFile: string
  /** The lessons' titles in the brief's order. */
  readonly titles: readonly string[]
  /** The demos file's path under the repository, and what it holds. */
  readonly demosFile: string
  readonly modelTables: readonly ModelTable[]
  /** Diagnostics the module's test allows, each as `<file name> <severity> <code>`, and why. Empty for a module with none. */
  readonly allowedDiagnostics?: readonly string[]
  /** Minutes of the module's browser hours that no lesson holds (a lab or a game that the module page runs), when it has any. */
  readonly browserMinutesBesideLessons?: number
  /** The labs that the module page carries, as the compiler reads them. Empty for a module with none. */
  readonly labs: readonly { readonly id: string; readonly lane: string; readonly stages?: readonly string[] }[]
  /** One sentence of the module page that says where the GPU part is, or that there is none, in the engine's own words. */
  readonly announces: string
  /**
   * Lessons whose Test is a graded game and not a set of three questions, because no question family assesses their KCs yet. Each is listed
   * here so that it is not forgotten: a lesson that gains a family leaves the list, and the kit refuses a listed lesson that ends in items.
   */
  readonly gameTests?: readonly string[]
  /** Lessons whose three questions hold no numeric one. The kit lists them for wave 4 and refuses a listed lesson that has a numeric question. */
  readonly noNumeric?: readonly string[]
  /**
   * What the lessons still to be written take up, for a module that is published lesson by lesson: the KCs that no written lesson teaches yet
   * and the claims of the module's file that nothing reads yet, each named. The kit refuses an entry that a written lesson already teaches or
   * reads, and one that is not the module's, so the lists only shrink: each lesson that lands removes what it takes up, and a whole module
   * has none.
   */
  readonly toCome?: { readonly kcs: readonly string[]; readonly claims: readonly string[] }
}

const SEEDS = 6

/** Registers the module's checks. One call in a module's test file; it adds its describe blocks to that file. */
export function moduleKit(spec: ModuleKitSpec): void {
  const { id, result } = spec
  const lessons = spec.lessonFiles.map((file) => {
    const slug = path.basename(file, '.md')
    const out = result.outputs.find((o) => o.path === `src/content/generated/lessons/${id}.${slug}.json`)
    if (out === undefined) throw new Error(`the compiler wrote no lesson for ${file}`)
    return {
      file,
      slug,
      text: read(file),
      lesson: compiledLessonSchema.parse(JSON.parse(out.text)),
    }
  })
  const moduleOut = result.outputs.find((o) => o.path === `src/content/generated/modules/${id}.json`)
  if (moduleOut === undefined) throw new Error(`the compiler wrote no module for ${id}`)
  const module_ = compiledModuleSchema.parse(JSON.parse(moduleOut.text))
  const moduleText = read(spec.moduleFile)
  const label = id.toUpperCase()

  describe(`module kit, ${label}: it compiles, and every lesson has its parts`, () => {
    test('the module, its lessons and its claims are in the compiled course', () => {
      expect(module_.id).toBe(id)
      expect(lessons.map((l) => l.lesson.id)).toEqual(spec.lessonFiles.map((file) => `${id}.${path.basename(file, '.md').split('-')[0]}`))
      expect(result.claims.some((record) => record.file === spec.claimsFile)).toBe(true)
    })

    test('nothing in the module, its lessons or its claims is reported, with no pacing allowance but the lines the module names', () => {
      const mine = result.diagnostics.filter((d) => d.file.startsWith(`content/modules/${id}/`) || d.file === spec.claimsFile)
      expect(mine.map((d) => `${d.file.split('/').pop()} ${d.severity} ${d.code}`)).toEqual([...(spec.allowedDiagnostics ?? [])])
    })

    for (const { lesson } of lessons) {
      test(`${lesson.id}: a prediction, and a game or an item to play after it`, () => {
        const firstPredict = lesson.blocks.findIndex((block) => block.type === 'predict')
        const playable = lesson.blocks.findIndex((block, at) => at > firstPredict && (block.type === 'game' || block.type === 'item'))
        expect(firstPredict).toBeGreaterThanOrEqual(0)
        expect(playable).toBeGreaterThan(firstPredict)
        for (const block of lesson.blocks) if (block.type === 'predict') expect(block.id.startsWith(`${lesson.id}.`)).toBe(true)
      })

      test(`${lesson.id}: a Test of three questions, one of them numeric at least`, () => {
        const exit = exitCheck(lesson.blocks)
        expect(exit).not.toBeNull()
        if (exit === null) return
        // The Test is the end of the lesson: nothing follows it but the blocks it is made of and the lines that lead into them.
        for (const block of exit.blocks) expect(['item', 'game', 'prose']).toContain(block.type)
        const sets = exit.blocks.flatMap((block) => (block.type === 'item' ? [block] : []))
        if (spec.gameTests?.includes(lesson.id) === true) {
          expect([lesson.id, sets.length, exit.blocks.some((block) => block.type === 'game' && block.mode === 'graded')]).toEqual([lesson.id, 0, true])
        } else {
          expect([lesson.id, sets.reduce((sum, block) => sum + block.count, 0)]).toEqual([lesson.id, 3])
          const served = sets.flatMap((block) => {
            const gen = familyById(block.family)
            if (gen === undefined || !isLevel(block.level)) throw new Error(`${lesson.id}: ${block.family} at level ${block.level} cannot be drawn`)
            return Array.from({ length: SEEDS }, (_, at) =>
              startAttempt(gen, block.level as Parameters<typeof startAttempt>[1], fixedSeeds(block.count, 0x6b17 + at)).served.map((s) => s.item.answer.kind),
            )
          })
          expect([lesson.id, served.some((kinds) => kinds.includes('numeric'))]).toEqual([lesson.id, spec.noNumeric?.includes(lesson.id) !== true])
        }
      })

      test(`${lesson.id} says ${lesson.minutes} minutes and the compiler reads ${lesson.readingMinutes}`, () => {
        expect(Math.abs(lesson.minutes - lesson.readingMinutes)).toBeLessThanOrEqual(MINUTES_TOLERANCE * lesson.minutes)
      })
    }

    test("the lessons never exceed the module's browser hours, and add up to them within 10% where the call says what else fills them", () => {
      const minutes = lessons.reduce((sum, l) => sum + l.lesson.minutes, 0) + (spec.browserMinutesBesideLessons ?? 0)
      const browserMinutes = (module_.hours_by_lane?.B ?? 0) * 60
      expect(minutes).toBeLessThanOrEqual(1.1 * browserMinutes)
      if (spec.browserMinutesBesideLessons !== undefined) expect(Math.abs(minutes - browserMinutes)).toBeLessThanOrEqual(0.1 * browserMinutes)
    })

    test('the module and its lessons are in review', () => {
      expect([module_.status, ...lessons.map((l) => l.lesson.status)]).toEqual(Array.from({ length: lessons.length + 1 }, () => 'review'))
    })
  })

  describe(`module kit, ${label}: what it teaches`, () => {
    test("every KC of the module is taught by a lesson, and no lesson teaches another module's", () => {
      const graph = readFileSync(path.join(repo, 'content/kc/graph.yaml'), 'utf8')
      const mine = [...graph.matchAll(new RegExp(`^- id: (${id}\\.[a-z0-9-]+)$`, 'gm'))].map((m) => m[1])
      const taught = new Set(lessons.flatMap((l) => l.lesson.kcs))
      const toCome = spec.toCome?.kcs ?? []
      expect(mine.filter((kc) => !taught.has(kc) && !toCome.includes(kc))).toEqual([])
      expect([...taught].filter((kc) => !mine.includes(kc))).toEqual([])
      // A KC still to come is the module's and is taught by no written lesson.
      expect(toCome.filter((kc) => taught.has(kc) || !mine.includes(kc))).toEqual([])
    })

    test('the lessons follow the brief: its titles, in its order', () => {
      expect(lessons.map((l) => l.lesson.title)).toEqual([...spec.titles])
    })

    test('a game block names a built game of the module and a built level of it, and a graded block a level that grades', () => {
      for (const { lesson } of lessons) {
        for (const block of lesson.blocks) {
          if (block.type !== 'game') continue
          expect([lesson.id, block.id, module_.games?.includes(block.id)]).toEqual([lesson.id, block.id, true])
          const level = GAMES.get(block.id)?.levels.find((l) => l.id === block.level)
          expect([lesson.id, block.id, block.level, level !== undefined]).toEqual([lesson.id, block.id, block.level, true])
          if (block.mode === 'graded') expect([lesson.id, block.level, level?.graded]).toEqual([lesson.id, block.level, true])
        }
      }
    })

    test("an item block names a built family at a level it offers, and draws the block's count", () => {
      for (const { lesson } of lessons) {
        for (const block of lesson.blocks) {
          if (block.type !== 'item') continue
          const gen = familyById(block.family)
          expect([lesson.id, block.family, gen !== undefined]).toEqual([lesson.id, block.family, true])
          if (gen === undefined || !isLevel(block.level)) throw new Error(`${lesson.id}: ${block.family} at level ${block.level} cannot be drawn`)
          expect([lesson.id, block.family, startAttempt(gen, block.level, fixedSeeds(block.count, 0x7a8)).served.length]).toEqual([
            lesson.id,
            block.family,
            block.count,
          ])
        }
      }
    })
  })

  describe(`module kit, ${label}: the module is its course.yaml entry, and the part that needs a GPU is announced`, () => {
    test('the title, hours, lanes, prerequisites and artifacts are the entry of content/course.yaml', () => {
      const course = courseSchema.parse(load(read('content/course.yaml')))
      const entry = course.modules.find((m) => m.id === id)
      expect(entry).toBeDefined()
      expect(module_.title).toBe(entry?.title)
      expect(module_.hours).toBe(entry?.hours)
      expect(module_.hours_by_lane).toEqual(entry?.hours_by_lane)
      expect(module_.prereqs ?? []).toEqual(entry?.prereqs ?? [])
      expect(module_.artifacts).toEqual(entry?.artifacts ?? [])
    })

    test('the module page carries the labs it names, and says in its own words where the GPU part is', () => {
      const labs = module_.blocks.filter((block) => block.type === 'lab').map((lab) => ({ id: lab.id, lane: lab.lane, stages: lab.stages }))
      expect(labs).toEqual(spec.labs.map((lab) => ({ id: lab.id, lane: lab.lane, stages: lab.stages })))
      expect(moduleText).toContain(spec.announces)
      // A learner reads the module page: no task, decision or design-document id.
      expect(moduleText).not.toMatch(/\b(?:W\d+[a-z]?-T\d+|R-T\d+|D-\d{2,3}|O-\d+|ASSESSMENT)\b|\bW2\b/)
    })

    test('the lessons are browser lessons: lane B, with no trace, and a lab among them is a lab of the browser', () => {
      for (const { lesson } of lessons) {
        expect([lesson.id, lesson.lanes]).toEqual([lesson.id, ['B']])
        expect([lesson.id, lesson.blocks.filter((b) => b.type === 'trace').length]).toEqual([lesson.id, 0])
        for (const block of lesson.blocks) if (block.type === 'lab') expect([lesson.id, block.id, block.lane]).toEqual([lesson.id, block.id, 'B'])
      }
    })
  })

  describe(`module kit, ${label}: the claims of ${spec.claimsFile}`, () => {
    const lock = lockFileSchema.parse(JSON.parse(read('course.lock.json')))
    const mine = result.claims.filter((record) => record.file === spec.claimsFile).map((record) => record.claim)

    test('a claim that names a pin names a key of the lockfile', () => {
      expect(mine.length).toBeGreaterThan(0)
      for (const claim of mine) if (claim.pin !== undefined) expect([claim.id, lock.entries.some((e) => e.key === claim.pin)]).toEqual([claim.id, true])
    })

    test('no claim cites main, master, latest or stable', () => {
      for (const claim of mine) expect([claim.id, /\/(?:main|master|latest|stable|HEAD)(?:\/|#|$)/.test(claim.source?.url ?? '')]).toEqual([claim.id, false])
    })

    test('a source is read on a day that is not after the day it was checked', () => {
      for (const claim of mine) {
        if (claim.source !== undefined) {
          expect([claim.id, /^\d{4}-\d{2}-\d{2}$/.test(claim.source.accessed)]).toEqual([claim.id, true])
          expect([claim.id, claim.source.accessed <= claim.verifiedAt]).toEqual([claim.id, true])
        }
      }
    })

    test("a quote is the source's own words, not blank and not long, and a claim says what it claims in a sentence", () => {
      for (const claim of mine) {
        if (claim.source === undefined) continue
        expect([claim.id, claim.source.quote.trim().length > 8]).toEqual([claim.id, true])
        expect([claim.id, claim.source.quote.length <= 260]).toEqual([claim.id, true])
        expect([claim.id, /[.]\s*$/.test(claim.text)]).toEqual([claim.id, true])
      }
    })

    test('a derived claim carries its formula and no source', () => {
      for (const claim of mine) {
        if (claim.tag !== 'derived') continue
        expect([claim.id, claim.derived !== undefined]).toEqual([claim.id, true])
        expect(claim.source).toBeUndefined()
      }
    })

    test('every claim of the file is read: cited by a lesson, the module or a card, or the input of a derived claim that is', () => {
      const cited = new Set<string>()
      const cards = (module_.worlds ?? []).map((world) => read(`content/cards/${world}.md`))
      for (const text of [...lessons.map((l) => l.text), moduleText, ...cards]) for (const m of text.matchAll(/\{\{claim:([a-z0-9.-]+)\}\}/g)) cited.add(m[1])
      const byId = new Map(result.claims.map((record) => [record.claim.id, record.claim]))
      for (let pass = 0; pass < 3; pass++) for (const claimId of [...cited]) for (const input of byId.get(claimId)?.derived?.inputs ?? []) cited.add(input)
      const toCome = spec.toCome?.claims ?? []
      expect(mine.map((c) => c.id).filter((claimId) => !cited.has(claimId) && !toCome.includes(claimId))).toEqual([])
      // A claim still to come is the file's, and nothing written reads it yet.
      expect(toCome.filter((claimId) => cited.has(claimId) || !mine.some((c) => c.id === claimId))).toEqual([])
    })
  })

  describe(`module kit, ${label}: every model table is held`, () => {
    const cards = (module_.worlds ?? []).map((world) => ({
      id: `card:${world}`,
      text: read(`content/cards/${world}.md`),
    }))
    const texts = [...lessons.map((l) => ({ id: l.lesson.id, text: l.text })), ...cards]
    const demosText = read(spec.demosFile)
    const found = texts.flatMap(({ id: at, text }) => modelTablesOf(text).map((table) => ({ id: at, table })))

    test('the lessons and cards print at least one model table, or the module holds none', () => {
      expect(found.length).toBe(spec.modelTables.length)
    })

    for (const { id: at, table } of found) {
      test(`${at}:${table.line} is held: ${table.header}`, () => {
        expect(
          tableProblems(
            at,
            table,
            spec.modelTables.find((hold) => hold.lesson === at && hold.header === table.header),
            demosText,
          ),
        ).toEqual([])
      })
    }

    test('no table is unheld, and the demos file holds no table that a lesson does not print', () => {
      expect(modelTableProblems(texts, spec.modelTables, demosText)).toEqual([])
    })
  })
}
