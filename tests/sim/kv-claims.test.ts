/*
 * The claims that the hybrid KV model cites (TRACKER W1-T21; ARCHITECTURE §4.4, §5.4): every rule in packages/sim/kv names the claim it
 * follows in a comment, and each of those exists. The file content/claims/vllm/kv-manager.yaml holds the ones the task added to W1-T01's,
 * each read at the pinned tag (course.lock.json) with the lines of its quote, and the card of the world cites them.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { lockFileSchema } from '@es/schema/lock'
import { compileContent } from '../../scripts/content/build.ts'

const repo = path.resolve(import.meta.dirname, '../..')
const result = compileContent({ root: repo })
const ids = new Set(result.claims.map((record) => record.claim.id))
const mine = result.claims.filter((record) => record.file === 'content/claims/vllm/kv-manager.yaml')

const dir = path.join(repo, 'packages/sim/kv')
const sources = readdirSync(dir)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name, text: readFileSync(path.join(dir, name), 'utf8') }))

/** The claim ids that a text names: a name of an engine, then dotted words, such as `vllm.kv-pool.touch`. A name that ends in a star is a family. */
const named = (text: string): string[] => [...text.matchAll(/\b((?:vllm|sglang|kv)\.[a-z0-9]+(?:[.-][a-z0-9]+)+)\b(?!\.\*)/g)].map((match) => match[1])

describe('the claims that packages/sim/kv cites', () => {
  test('exist: every claim id named in a comment of the model is a claim of the registry', () => {
    const missing: string[] = []
    let cited = 0
    for (const { name, text } of sources) {
      for (const id of named(text)) {
        // A file name such as `kv.json` or a path such as `vllm.kv-pool` inside prose is not a claim; the ids that matter start with an engine's name and a topic.
        if (!/^(?:vllm|sglang)\./.test(id)) continue
        cited++
        if (!ids.has(id)) missing.push(`${name}: ${id}`)
      }
    }
    expect(missing).toEqual([])
    expect(cited).toBeGreaterThan(40)
  })

  test('cover the rules: the files that hold a rule of the pin cite a claim for it', () => {
    for (const file of ['reference.ts', 'lookup.ts', 'spec.ts', 'presets.ts', 'events.ts', 'hash.ts']) {
      const found = sources.find((s) => s.name === file)
      expect([file, named(found?.text ?? '').some((id) => /^(?:vllm|sglang)\./.test(id))]).toEqual([file, true])
    }
  })

  test('are cited by the card of the world, which names every claim of the file that the task added', () => {
    const card = readFileSync(path.join(repo, 'content/cards/kv.md'), 'utf8')
    for (const record of mine) {
      // The design document's worked examples and the event details may be named in code and tests instead, but every rule is on the card.
      if (['vllm.hybrid-kv.doc-example-blocks', 'vllm.hybrid-kv.doc-gemma3-layers'].includes(record.claim.id)) continue
      expect([record.claim.id, card.includes(`{{claim:${record.claim.id}}}`)]).toEqual([record.claim.id, true])
    }
  })
})

describe('content/claims/vllm/kv-manager.yaml', () => {
  const lock = lockFileSchema.parse(JSON.parse(readFileSync(path.join(repo, 'course.lock.json'), 'utf8')))
  const vllm = lock.entries.find((entry) => entry.key === 'vllm')

  test('is many claims, all about vLLM at its pin, each read the same day and measured', () => {
    expect(mine.length).toBeGreaterThan(25)
    for (const { claim } of mine) {
      expect([claim.id, claim.pin, claim.tag, claim.ttlDays]).toEqual([claim.id, 'vllm', 'measured', 90])
      expect(claim.id.startsWith('vllm.')).toBe(true)
      expect(claim.source?.accessed).toBe(claim.verifiedAt)
    }
  })

  test('cites each file at the pinned tag, with the lines of its quote, and never at main', () => {
    for (const { claim } of mine) {
      const url = claim.source?.url ?? ''
      expect([claim.id, url.startsWith(`https://github.com/vllm-project/vllm/blob/v${vllm?.version}/`)]).toEqual([claim.id, true])
      expect([claim.id, /#L\d+(?:-L\d+)?$/.test(url)]).toEqual([claim.id, true])
      expect(url).not.toMatch(/\/(?:main|master|latest|stable|HEAD)\//)
      expect((claim.source?.quote ?? '').length).toBeLessThanOrEqual(260)
      expect((claim.source?.quote ?? '').includes('\n')).toBe(false)
    }
  })

  test('names the commit of the pin in its header, as the lockfile pins it', () => {
    const text = readFileSync(path.join(repo, 'content/claims/vllm/kv-manager.yaml'), 'utf8')
    expect(text).toContain(vllm?.commit ?? 'no commit')
  })

  test('has an id that no other file of the registry has, and does not repeat what W1-T01 wrote', () => {
    const others = result.claims.filter((record) => record.file !== 'content/claims/vllm/kv-manager.yaml').map((record) => record.claim.id)
    for (const { claim } of mine) expect([claim.id, others.includes(claim.id)]).toEqual([claim.id, false])
    expect(new Set(mine.map((record) => record.claim.id)).size).toBe(mine.length)
  })
})
