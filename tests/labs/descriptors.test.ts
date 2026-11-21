/*
 * W2b-T30: every graded lab's descriptor (src/labs/published.ts), and the specimen (src/labs/specimen.ts), against what the rest of the
 * repository says of the lab, so that a page cannot drift from the lab it describes:
 *
 *   - the lab is one of src/receipts/labs.ts, of lane L or F, and its stages are that list's, in its order;
 *   - each stage's checks are the ones packages/verify/stages.ts gives it, every required one is on the page, and who checks it and whether
 *     it is optional are that table's;
 *   - a stage's grade command names the stage and takes its challenge's token, and a stage's state fits its lane;
 *   - a verified stage gives a real day and a whole commit;
 *   - a crate the kit links is a forge lab's, and no file is linked twice;
 *   - no sentence holds a number without a tag or a banned word;
 *   - a published lab's heading is its `labName`, so the page and its served document agree, and it has left the stub table.
 * And the words of the page itself (src/labs/copy.ts): the four state lines are the fixed set, and no string holds an untagged number,
 * a banned word or a build-log id.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { stageRow } from '../../packages/verify/stages'
import { untaggedNumbers, withoutCode } from '../../scripts/content/prose'
import { findBanned } from '../../src/copy/banned'
import { labName } from '../../src/content/render/model'
import { FORGE_LAB_IDS } from '../../src/forge/ids'
import { labPageCopy, STAGE_STATE } from '../../src/labs/copy'
import { fileFor, parseKitFiles } from '../../src/labs/kit-files'
import { GRADED_LABS, SPECIMEN_IDS } from '../../src/labs/published'
import { SPECIMENS } from '../../src/labs/specimen'
import type { GradedLab } from '../../src/labs/types'
import { labById } from '../../src/receipts/labs'
import { LAB_STUBS } from '../../src/unbuilt/copy'

const root = path.resolve(import.meta.dirname, '../..')
const MANIFEST = parseKitFiles(JSON.parse(readFileSync(path.join(root, 'public/labs/manifest.json'), 'utf8')))

const ALL: readonly [string, GradedLab][] = [
  ...Object.entries(GRADED_LABS).map(([key, lab]) => [`published ${key}`, lab] as [string, GradedLab]),
  ...Object.entries(SPECIMENS).map(([key, lab]) => [`specimen ${key}`, lab] as [string, GradedLab]),
]

/** Every sentence of a descriptor that a learner reads. */
function sentencesOf(lab: GradedLab): string[] {
  return [
    lab.title,
    lab.builds,
    ...lab.needs.flatMap((need) => [need.term, need.detail]),
    ...lab.inputs.map((command) => command.then),
    lab.edit.note,
    ...lab.stages.flatMap((stage) => [stage.asks, stage.run.then, ...stage.checks.flatMap((check) => [check.label, check.catches])]),
    lab.prove.asks,
  ]
}

test('there is a specimen for every lab the dev and test builds draw one for, and only for those', () => {
  expect(Object.keys(SPECIMENS).sort()).toEqual([...SPECIMEN_IDS].sort())
})

describe.each(ALL)('%s', (_, lab) => {
  const listed = labById(lab.id)

  test('is a lab of the lab list, of lane L or F, with its stages in its order', () => {
    expect(listed).toBeDefined()
    expect(['L', 'F']).toContain(listed!.lane)
    expect(lab.stages.map((stage) => stage.id)).toEqual(listed!.stages.map((stage) => stage.id))
  })

  test("gives each stage the checks of packages/verify/stages.ts, every required one, with that table's word on who checks it", () => {
    for (const stage of lab.stages) {
      const row = stageRow(stage.id)
      expect(row, stage.id).toBeDefined()
      const grader = new Set([...row!.attested, ...row!.optional])
      const browser = new Set([...row!.rechecked, ...row!.captured])
      for (const check of stage.checks) {
        expect(grader.has(check.id) || browser.has(check.id), `${stage.id}: ${check.id} is a check of the stage`).toBe(true)
        expect(check.by, `${stage.id}: ${check.id}`).toBe(grader.has(check.id) ? 'grader' : 'browser')
        expect(check.optional === true, `${stage.id}: ${check.id} optional`).toBe(row!.optional.includes(check.id))
      }
      const shown = new Set(stage.checks.map((check) => check.id))
      for (const id of [...row!.attested, ...row!.rechecked]) expect(shown.has(id), `${stage.id}: the required check ${id} is on the page`).toBe(true)
      expect(shown.size, `${stage.id}: no check twice`).toBe(stage.checks.length)
    }
  })

  test("runs each stage with its own id and its challenge's token, and says where it stands in a state that fits the lane", () => {
    for (const stage of lab.stages) {
      expect(stage.run.line).toContain(`enginespace grade ${stage.id} --challenge <token>`)
      if (listed!.lane === 'L') expect(stage.state.kind).not.toBe('not-run-engine')
      if (listed!.lane === 'F') expect(stage.state.kind).not.toBe('not-run-weights')
      if (stage.state.kind === 'verified') {
        expect(stage.state.on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(Number.isNaN(Date.parse(stage.state.on))).toBe(false)
        expect(stage.state.commit).toMatch(/^[0-9a-f]{40}$/)
      }
    }
    for (const command of [...lab.inputs, ...lab.stages.map((stage) => stage.run)]) {
      if (command.ran !== undefined) expect(command.ran).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(command.line.trim()).toBe(command.line)
      expect(command.line).not.toContain('\n')
    }
  })

  test("links files the site's list holds, each once, a crate only of a forge lab", () => {
    const kinds = lab.kit.map((ref) => (ref.kind === 'forge-lab' ? `${ref.kind}:${ref.lab}` : ref.kind))
    expect(new Set(kinds).size).toBe(kinds.length)
    for (const ref of lab.kit) {
      if (ref.kind === 'forge-lab') expect(FORGE_LAB_IDS).toContain(ref.lab)
      expect(fileFor(MANIFEST, ref), ref.kind).toBeDefined()
    }
    expect(lab.kit.length).toBeGreaterThan(0)
  })

  test('holds no number without a tag and no banned word', () => {
    for (const sentence of sentencesOf(lab)) {
      expect(untaggedNumbers(withoutCode(sentence)), sentence).toEqual([])
      expect(findBanned(sentence).map((finding) => finding.match), sentence).toEqual([])
    }
    expect(sentencesOf(lab).join(' ')).not.toMatch(/\b(?:W\d+b?-T\d+|R-T\d+|D-\d{2,3}|Q-\d+)\b/)
  })
})

describe.each(Object.entries(GRADED_LABS))('published %s', (id, lab) => {
  test("is keyed by its id, is headed by its labName, and has left the stub table", () => {
    expect(lab.id).toBe(id)
    expect(lab.title).toBe(labName(id))
    expect(Object.hasOwn(LAB_STUBS, id)).toBe(false)
  })
})

describe("the page's own words", () => {
  test('the state lines are the fixed set, word for word', () => {
    expect([STAGE_STATE['not-run-weights'], STAGE_STATE['not-run-engine'], STAGE_STATE['awaiting-bank']]).toEqual([
      'built; the course has not yet run this lab on the pinned weights',
      'built; the course has not yet run this lab on a real engine',
      "awaiting the course's reference bank",
    ])
    expect(STAGE_STATE.verified('2026-11-20')).toBe('verified: the course ran it on 2026-11-20')
  })

  test('hold no number without a tag, no banned word and no build-log id', () => {
    const copy = labPageCopy()
    expect(copy.length).toBeGreaterThan(30)
    expect(copy.flatMap((text) => untaggedNumbers(withoutCode(text)))).toEqual([])
    expect(copy.flatMap((text) => findBanned(text).map((finding) => `${finding.match} in "${text}"`))).toEqual([])
    expect(copy.join(' ')).not.toMatch(/\b(?:W\d+b?-T\d+|R-T\d+|D-\d{2,3}|Q-\d+)\b/)
  })
})
