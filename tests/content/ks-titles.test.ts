/*
 * The titles a page prints for the kernelspace lessons it names (src/content/render/ksTitles.ts): every lesson ref that the course's own
 * files use has one, and a title stands inside a sentence as the part before its colon.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { kernelspaceLabel, kernelspaceTitle } from '@/content/render/model'
import { repo } from './support.ts'

const files = (readdirSync(path.join(repo, 'content'), { recursive: true }) as string[]).filter((file) => file.endsWith('.md') || file.endsWith('.yaml'))
const used = new Set(files.flatMap((file) => readFileSync(path.join(repo, 'content', file), 'utf8').match(/ks:(?:T[0-7]|R)\.L\d+/g) ?? []))

describe('kernelspace lesson titles', () => {
  test('every lesson ref that the content names has a title', () => {
    expect(used.size).toBeGreaterThan(10)
    expect([...used].filter((ref) => kernelspaceTitle(ref) === null)).toEqual([])
  })

  test('a title is whole, or cut before its colon where it stands inside a sentence', () => {
    expect(kernelspaceTitle('ks:T5.L10')).toBe('The Production Stack: vLLM, SGLang, TRT-LLM, Dynamo')
    expect(kernelspaceTitle('ks:T5.L10', true)).toBe('The Production Stack')
    expect(kernelspaceTitle('ks:T5.L7', true)).toBe('Continuous Batching')
  })

  test('a ref with no title reads as the lesson\'s place in kernelspace', () => {
    expect(kernelspaceTitle('ks:t5.kv-capacity')).toBeNull()
    expect(kernelspaceLabel('ks:T5.L7')).toBe('kernelspace T5.L7')
  })
})
