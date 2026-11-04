/*
 * D-030: zod is the one schema source, and `z.toJSONSchema` exports it for the grader's `jsonschema`. W2-T01 writes the export
 * script; this holds the schemas of W0-T07 to what the export needs, so that task does not find them out of reach:
 *
 *   - every schema exports, as an authored input and as the parsed output;
 *   - every object in the export closes its keys (`additionalProperties: false`), as the schema does;
 *   - every pattern is plain enough for Python's `re`, which reads neither JS named groups nor `\p{…}` classes.
 */
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { claimSchema, claimsFileSchema } from '@es/schema/claims'
import { blockBodySchemas, blockSchema, lessonFrontMatterSchema, moduleFrontMatterSchema } from '@es/schema/content'
import { kcGraphSchema, kcSchema } from '@es/schema/kc'
import { lockEntrySchema, lockFileSchema } from '@es/schema/lock'
import { refSchema } from '@es/schema/refs'

const schemas: [string, z.ZodType][] = [
  ['lesson front matter', lessonFrontMatterSchema],
  ['module front matter', moduleFrontMatterSchema],
  ['a block', blockSchema],
  ...Object.entries(blockBodySchemas).map(([name, schema]): [string, z.ZodType] => [`a ${name} body`, schema]),
  ['a claim', claimSchema],
  ['a claims file', claimsFileSchema],
  ['a lock entry', lockEntrySchema],
  ['a lock file', lockFileSchema],
  ['a KC', kcSchema],
  ['a KC graph', kcGraphSchema],
  ['a ref', refSchema],
]

/** Every object and array in a JSON document, the document itself first. */
function nodes(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json.flatMap(nodes)
  if (json !== null && typeof json === 'object') return [json as Record<string, unknown>, ...Object.values(json).flatMap(nodes)]
  return []
}

describe('JSON Schema export', () => {
  for (const [name, schema] of schemas) {
    describe(name, () => {
      for (const io of ['input', 'output'] as const) {
        test(`exports as ${io}, with its keys closed and its patterns portable`, () => {
          const json = z.toJSONSchema(schema, { io })
          expect(typeof json.$schema).toBe('string')
          const all = nodes(json)
          const objects = all.filter((node) => node.type === 'object' && node.properties !== undefined)
          expect(objects.filter((node) => node.additionalProperties !== false)).toEqual([])
          const patterns = all.flatMap((node) => (typeof node.pattern === 'string' ? [node.pattern] : []))
          for (const pattern of patterns) {
            expect(() => new RegExp(pattern)).not.toThrow()
            expect(pattern).not.toMatch(/\(\?<[^=!]|\(\?P|\\p\{/)
          }
        })
      }
    })
  }

  test('a KC’s edge lists are optional as an authored input and present in the parsed output', () => {
    const input = z.toJSONSchema(kcSchema, { io: 'input' }) as { required: string[] }
    const output = z.toJSONSchema(kcSchema, { io: 'output' }) as { required: string[] }
    expect(input.required.sort()).toEqual(['description', 'id'])
    expect(output.required.sort()).toEqual(['confusable', 'description', 'id', 'requires'])
  })

  test('the exported pattern of a ref is the one the schema applies', () => {
    const json = z.toJSONSchema(refSchema) as { pattern: string }
    const pattern = new RegExp(json.pattern)
    expect(pattern.test('play:loop/close')).toBe(true)
    expect(pattern.test('play:loop')).toBe(false)
  })
})
