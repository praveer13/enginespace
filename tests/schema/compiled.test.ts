/*
 * W0-T08's schemas: `content/course.yaml` (ARCHITECTURE §2.2) and what the content compiler writes (§4.6). They are the shapes
 * the renderer reads, so each rejects a key it does not know, and the prose tree holds no node that could carry HTML.
 */
import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { z } from 'zod'
import {
  claimsOutputSchema,
  compiledBlockSchema,
  compiledLessonSchema,
  compiledModuleSchema,
  contentIndexSchema,
  courseSchema,
  lessonRoute,
  lessonSlugSchema,
  moduleRoute,
  proseFlowSchema,
  proseInlineSchema,
} from '@es/schema'
import { compileContent } from '../../scripts/content/build.ts'
import { objectPaths, problems, read, where, withKey, yaml } from './support'

const result = compileContent({ root: path.resolve(import.meta.dirname, '../..') })
const output = (file: string) => JSON.parse(result.outputs.find((o) => o.path === file)?.text ?? 'null') as Record<string, unknown>

const lesson = output('src/content/generated/lessons/tr2.l0-sample.json')
const module_ = output('src/content/generated/modules/tr2.json')
const index = output('src/content/generated/index.json')
const claims = output('public/claims.json')
const course = yaml(read('content/course.yaml'))

describe('the repo\'s sample outputs', () => {
  test('are valid, and are what the schemas parse them to', () => {
    expect(compiledLessonSchema.parse(lesson)).toEqual(lesson as never)
    expect(compiledModuleSchema.parse(module_)).toEqual(module_ as never)
    expect(contentIndexSchema.parse(index)).toEqual(index as never)
    expect(claimsOutputSchema.parse(claims)).toEqual(claims as never)
    expect(courseSchema.parse(course)).toEqual(course as never)
  })
})

describe('every object rejects an unknown key', () => {
  const subjects: [string, z.ZodType, unknown][] = [
    ['a compiled lesson', compiledLessonSchema, lesson],
    ['a compiled module', compiledModuleSchema, module_],
    ['the index', contentIndexSchema, index],
    ['the claims file', claimsOutputSchema, claims],
    ['course.yaml', courseSchema, course],
  ]
  for (const [name, schema, value] of subjects) {
    test(name, () => {
      expect(problems(schema, value)).toEqual([])
      const paths = objectPaths(value)
      expect(paths.length).toBeGreaterThan(1)
      for (const path of paths) {
        // A block is one of two shapes, prose or the others, and a union names the block when neither fits.
        const block = path[0] === 'blocks' ? `blocks.${path[1]}` : undefined
        const expected = block === undefined ? `${where(path)}: unrecognized_keys[zzz]` : `${block}: invalid_union`
        expect(problems(schema, withKey(value, [...path, 'zzz'], true))).toEqual([expected])
      }
    })
  }
})

const text = { type: 'text', text: 'x' }

describe('the prose tree', () => {
  test('holds the nodes of ARCHITECTURE §4.1 and no others', () => {
    for (const node of [
      text,
      { type: 'em', children: [text] },
      { type: 'strong', children: [text] },
      { type: 'code', text: '<b>' },
      { type: 'link', href: 'https://example.com', children: [text] },
      { type: 'claim', id: 'a.b' },
      { type: 'ks', ref: 'ks:T5.L7' },
      { type: 'tag', tag: 'measured' },
    ]) {
      expect(proseInlineSchema.safeParse(node).success).toBe(true)
    }
    for (const node of [{ type: 'html', html: '<b>' }, { type: 'image', src: 'a.png' }, { type: 'text', html: '<b>x</b>' }, { type: 'tag', tag: 'guessed' }, { type: 'text', text: '' }]) {
      expect(proseInlineSchema.safeParse(node).success).toBe(false)
    }
    for (const node of [
      { type: 'paragraph', children: [text] },
      { type: 'heading', depth: 2, children: [text] },
      { type: 'list', ordered: true, start: 3, items: [[{ type: 'paragraph', children: [text] }]] },
      { type: 'table', align: ['left', null], head: [[text], [text]], rows: [[[text], [text]]] },
      { type: 'code', lang: 'rust', text: 'x' },
    ]) {
      expect(proseFlowSchema.safeParse(node).success).toBe(true)
    }
    for (const node of [{ type: 'html', html: '<div>' }, { type: 'heading', depth: 1, children: [text] }, { type: 'heading', depth: 5, children: [text] }, { type: 'blockquote', children: [] }, { type: 'paragraph', children: [] }]) {
      expect(proseFlowSchema.safeParse(node).success).toBe(false)
    }
  })

  test('lets a link go to https, a route of the site or an anchor, and nowhere else', () => {
    const link = (href: string) => proseInlineSchema.safeParse({ type: 'link', href, children: [text] }).success
    for (const ok of ['https://example.com/a?b=c#d', '/map', '/m/tr2/l0-sample', '#why']) expect(link(ok)).toBe(true)
    for (const bad of ['javascript:alert(1)', 'http://example.com', '//example.com', 'data:text/html,x', 'mailto:a@b.c', 'foo.md', 'https://exa mple.com', 'https://example.com/"onclick', '']) {
      expect(link(bad)).toBe(false)
    }
  })

  test('is recursive: emphasis in a link in emphasis', () => {
    expect(proseInlineSchema.safeParse({ type: 'em', children: [{ type: 'link', href: '/map', children: [{ type: 'strong', children: [text] }] }] }).success).toBe(true)
  })

  test('has a block that is the Markdown of a source prose block only in the source', () => {
    expect(compiledBlockSchema.safeParse({ type: 'prose', md: 'words' }).success).toBe(false)
    expect(compiledBlockSchema.safeParse({ type: 'prose', body: [{ type: 'paragraph', children: [text] }] }).success).toBe(true)
    expect(compiledBlockSchema.safeParse({ type: 'prose', body: [] }).success).toBe(false)
    expect(compiledBlockSchema.safeParse({ type: 'game', id: 'loop', level: 'async', mode: 'practice' }).success).toBe(true)
    expect(compiledBlockSchema.safeParse({ type: 'game', id: 'loop', level: 'async', mode: 'timed' }).success).toBe(false)
  })
})

describe('compiled lessons and modules', () => {
  test('carry a rev that is a SHA-256, and a slug that is a file name', () => {
    expect(problems(compiledLessonSchema, withKey(lesson, ['rev'], 'abc'))).toEqual(['rev: invalid_format'])
    expect(problems(compiledLessonSchema, withKey(lesson, ['slug'], 'L0 sample'))).toEqual(['slug: invalid_format'])
    expect(problems(compiledLessonSchema, withKey(lesson, ['rev'], undefined))).toEqual(['rev: invalid_type'])
  })

  test('take the lesson slugs of the compiler', () => {
    for (const ok of ['l0', 'l3', 'l12-async-overlap', 'l0-sample']) expect(lessonSlugSchema.safeParse(ok).success).toBe(true)
    for (const bad of ['3-async', 'lesson-3', 'l3_async', 'l3-', 'L3', 'l3-Async', 'l3--x', '']) expect(lessonSlugSchema.safeParse(bad).success).toBe(false)
  })

  test('have routes that the index agrees with', () => {
    expect(moduleRoute('tr2')).toBe('/m/tr2')
    expect(lessonRoute('tr2', 'l0-sample')).toBe('/m/tr2/l0-sample')
    const modules = (index as { modules: { id: string; route: string; lessons: { slug: string; route: string }[] }[] }).modules
    for (const module of modules) {
      expect(module.route).toBe(moduleRoute(module.id))
      for (const entry of module.lessons) expect(entry.route).toBe(lessonRoute(module.id, entry.slug))
    }
  })

  test('the index lists every module of course.yaml once, in order, with the hours of its lanes', () => {
    const parsed = contentIndexSchema.parse(index)
    const listed = (course as { modules: { id: string; hours: number; hours_by_lane: Record<string, number> }[] }).modules
    expect(parsed.modules.map((m) => m.id)).toEqual(listed.map((m) => m.id))
    expect(parsed.totalHours).toBe(listed.reduce((sum, m) => sum + m.hours, 0))
    expect(parsed.totalHours).toBe(91)
    for (const m of parsed.modules) {
      const lanes = Object.values(m.hours_by_lane).reduce((sum, hours) => sum + hours, 0)
      expect(lanes).toBeCloseTo(m.hours, 9)
    }
  })

  test('mark a module with no module.md as planned and give it no lessons', () => {
    const parsed = contentIndexSchema.parse(index)
    expect(parsed.modules.filter((m) => m.status === 'planned').map((m) => m.id)).toEqual(['tr0', 'tr1', 'tr3', 'tr4', 'tr5a', 'tr5b', 'tr6', 'tr7', 'tr8', 'capstone'])
    expect(parsed.modules.filter((m) => m.status === 'planned').every((m) => m.lessons.length === 0)).toBe(true)
  })
})

describe('course.yaml', () => {
  const module = { id: 'tr2', title: 'The step loop', hours: 10, hours_by_lane: { B: 10 } }

  test('takes a module with its hours split by lane', () => {
    expect(courseSchema.safeParse({ modules: [module, { id: 'tr3', title: 'Profile', hours: 12, hours_by_lane: { B: 5, F: 7 } }] }).success).toBe(true)
  })

  test('refuses lanes that do not add up, a module with no lane, a repeat, an id that is no module, and a blank title', () => {
    expect(problems(courseSchema, { modules: [{ ...module, hours_by_lane: { B: 9 } }] })).toEqual(['modules.0.hours_by_lane: custom'])
    expect(problems(courseSchema, { modules: [{ ...module, hours_by_lane: {} }] })).toEqual(['modules.0.hours_by_lane: custom'])
    expect(problems(courseSchema, { modules: [module, module] })).toEqual(['modules.1.id: custom'])
    expect(problems(courseSchema, { modules: [{ ...module, id: 'tr9' }] })).toEqual(['modules.0.id: invalid_format'])
    expect(problems(courseSchema, { modules: [{ ...module, title: ' ' }] })).toEqual(['modules.0.title: invalid_format'])
    expect(problems(courseSchema, { modules: [] })).toEqual(['modules: too_small'])
    expect(problems(courseSchema, { modules: [{ ...module, hours: 0, hours_by_lane: { B: 0 } }] }).length).toBeGreaterThan(0)
  })
})

describe('JSON Schema export (D-030)', () => {
  const schemas: [string, z.ZodType][] = [
    ['a compiled lesson', compiledLessonSchema],
    ['a compiled module', compiledModuleSchema],
    ['the index', contentIndexSchema],
    ['the claims file', claimsOutputSchema],
    ['course.yaml', courseSchema],
  ]
  for (const [name, schema] of schemas) {
    test(`${name} exports, with its keys closed`, () => {
      const json = JSON.stringify(z.toJSONSchema(schema, { io: 'output' }))
      expect(json).toContain('"additionalProperties":false')
      expect(json).not.toMatch(/"additionalProperties":true/)
    })
  }
})
