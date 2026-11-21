/*
 * The TR0 lab's kit folder (labs/gpu/tr0-forward): lab.toml says what the lab is, and says it the way the rest of the repository does. Its stages and their checks are the lab list's and
 * packages/verify/stages.ts's; its environment is a folder of labs/envs; its inputs are the references manifest's; the file it names to edit is in the folder and is the one the page
 * names; and the starter holds the contract the grader's worker keeps, and no solution.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { stageRow } from '../../packages/verify/stages'
import { findBanned } from '../../src/copy/banned'
import { GRADED_LABS } from '../../src/labs/published'
import { labById } from '../../src/receipts/labs'

const root = path.resolve(import.meta.dirname, '../..')
const folder = path.join(root, 'labs/gpu/tr0-forward')
const read = (file: string) => readFileSync(path.join(folder, file), 'utf8')

interface Toml {
  id: string
  title: string
  lane: string
  env: string
  edit: string
  run_from: string
  inputs: string
  budget: { stage_seconds: number }
  env_allowlist: { names: string[] }
  stage: { id: string; name: string; optional: boolean; checks: string[] }[]
}
const toml = (Bun as unknown as { TOML: { parse(text: string): unknown } }).TOML.parse(read('lab.toml')) as Toml

describe('lab.toml', () => {
  test('names the lab, its lane and its title as the site does', () => {
    const lab = labById(toml.id)
    expect(lab?.lane).toBe(toml.lane)
    expect(toml.title).toBe(GRADED_LABS[toml.id].title)
  })

  test("lists the lab's stages in order, with the names, the optional flag and the checks of the lab list and of packages/verify/stages.ts", () => {
    const lab = labById(toml.id)
    expect(toml.stage.map((stage) => stage.id)).toEqual((lab?.stages ?? []).map((stage) => stage.id))
    for (const [index, stage] of toml.stage.entries()) {
      const listed = lab?.stages[index]
      expect([stage.id, stage.name, stage.optional]).toEqual([listed?.id, listed?.name, listed?.optional])
      const row = stageRow(stage.id)
      const all = [...(row?.attested ?? []), ...(row?.rechecked ?? []), ...(row?.optional ?? [])].sort()
      expect([stage.id, [...stage.checks].sort()]).toEqual([stage.id, all])
    }
  })

  test('names an environment of labs/envs, the references manifest, and a file in the kit that the page names to edit', () => {
    expect(existsSync(path.join(root, 'labs/envs', toml.env, 'pyproject.toml'))).toBe(true)
    expect(toml.inputs).toBe('references/manifest.json')
    expect(existsSync(path.join(root, 'labs', toml.edit))).toBe(true)
    expect(toml.edit).toBe(GRADED_LABS[toml.id].edit.file)
    expect(toml.env_allowlist.names).toEqual([])
    expect(toml.budget.stage_seconds).toBeGreaterThan(0)
  })

  test('names every lab file of the manifest to fetch through its lab id, and the manifest lists the model for it', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'labs/references/manifest.json'), 'utf8')) as { entries: { labs: string[]; kind: string }[] }
    expect(manifest.entries.filter((entry) => entry.labs.includes(toml.id) && entry.kind === 'model').length).toBeGreaterThan(0)
  })
})

describe('the starter', () => {
  const starter = read('starter/forward.py')

  test('states the contract of the grader\'s worker: build, the call, layer, new_cache, step, cache.length, and the names of the five points', () => {
    for (const piece of ['build(config, weights)', 'model(ids) -> logits', 'model.layer(index, hidden)', 'model.new_cache()', 'model.step(ids, cache)', 'cache.length', 'embed_tokens', 'self_attn', 'mlp', 'norm', 'lm_head']) {
      expect(starter, piece).toContain(piece)
    }
  })

  test('is every piece still to write: no function of it returns something', () => {
    const raises = starter.match(/raise NotImplementedError/g) ?? []
    expect(raises.length).toBeGreaterThanOrEqual(12)
    expect(starter).not.toMatch(/\breturn\b(?!.*#)/)
    expect(starter).not.toMatch(/import transformers|from transformers/)
  })
})

describe('the words of the kit folder', () => {
  test.each(['LAB.md', 'lab.toml', 'starter/forward.py'])('%s holds no banned word, no build-log id and no path of this machine', (file) => {
    const text = read(file)
    expect(findBanned(text).map((finding) => finding.match)).toEqual([])
    expect(text).not.toMatch(/\b(?:W\d+b?-T\d+|R-T\d+|D-\d{2,3}|Q-\d+)\b/)
    expect(text).not.toMatch(/\/home\/|\/Users\/|\/tmp\//)
  })

  test('LAB.md names the file that the page names, and every command it shows is one the page shows or a scratch line', () => {
    const lab = GRADED_LABS['tr0.forward']
    const text = read('LAB.md')
    expect(text).toContain(lab.edit.file)
    for (const command of [...lab.inputs, ...lab.stages.map((stage) => stage.run)]) {
      expect(text).toContain(command.line.replace('<token>', '<token>'))
    }
  })
})
