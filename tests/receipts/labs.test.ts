/*
 * W2-T06: the labs and stages that /receipts offers (src/receipts/labs.ts) are the course's own.
 *
 *   - The stage ids are ASSESSMENT §5.9's table, and the curriculum's `receipt:<stage>` rows, and neither lists one that the other lacks.
 *   - A stage is optional exactly when §5.9 requires no check of it.
 *   - A lab's module and lane are course.yaml's (the compiled map's), and the labs are the labs of the course that run on the learner's
 *     machine: its lane-L and lane-F artifacts that have a dot in their id.
 *   - Every id is a lab or a stage id by the schema's own pattern, so a challenge for any of them is a token the codec writes.
 *
 * A stage that a later task adds, renames or makes optional fails here, with the document that says otherwise named.
 */
import { readdirSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { receiptLabIdSchema, stageIdSchema } from '@es/schema/refs'
import { labById, labForStage, RECEIPT_LABS, RECEIPT_STAGES, stageOf, stageTitle } from '@/receipts/labs'
import { backticked, read, tableRows, between } from '../ci/support'
import { MAP } from '../map/support'

/** Every stage of §5.9's table with whether the table requires something of it. A row may list two: `tr3.profile.s2`, `.s4`. */
function assessmentStages(): { id: string; required: boolean }[] {
  const table = between(read('docs/ASSESSMENT.md'), '### 5.9 Required checks per stage', '## 6.')
  return tableRows(table).flatMap(([stages, required]) => {
    const ids: string[] = []
    let lab = ''
    for (const name of backticked(stages)) {
      const id = name.startsWith('.') ? `${lab}${name}` : name
      lab = id.slice(0, id.lastIndexOf('.'))
      ids.push(id)
    }
    // "—" opens an empty cell, and so does "— (practice)": nothing is required of the stage.
    return ids.map((id) => ({ id, required: !required.startsWith('—') }))
  })
}

/** The stage ids of every `receipt:<stage>` row in the curriculum. */
function curriculumStages(): string[] {
  return readdirSync(new URL('../../curriculum', import.meta.url).pathname)
    .filter((file) => file.endsWith('.md'))
    .flatMap((file) => [...read(`curriculum/${file}`).matchAll(/^\| `receipt:([^`]+)`/gm)].map((match) => match[1]))
}

describe('the stages', () => {
  const ours = RECEIPT_STAGES.map((stage) => stage.id)

  test("are ASSESSMENT §5.9's, none more and none fewer (its table puts s2 and s4 of the profile on one row, so the order is not compared)", () => {
    expect(assessmentStages().length).toBeGreaterThan(20)
    expect([...ours].sort()).toEqual(assessmentStages().map((stage) => stage.id).sort())
  })

  test("are the curriculum's receipt rows, none more and none fewer", () => {
    expect(curriculumStages().length).toBeGreaterThan(20)
    expect([...ours].sort()).toEqual(curriculumStages().sort())
  })

  test('are optional exactly when §5.9 requires no check of them', () => {
    const required = new Map(assessmentStages().map((stage) => [stage.id, stage.required]))
    for (const stage of RECEIPT_STAGES) expect([stage.id, stage.optional]).toEqual([stage.id, !required.get(stage.id)])
    // Eight of them: the module can be finished without these.
    expect(RECEIPT_STAGES.filter((stage) => stage.optional).map((stage) => stage.id)).toEqual([
      'tr0.forward.s1',
      'tr1.fork.s3',
      'tr3.profile.s1',
      'tr3.profile.s5',
      'tr4.sweep.s4',
      'tr5b.connector.s4',
      'tr8.replay.s1',
      'tr8.replay.s3',
    ])
  })

  test('are numbered from 1 with no gap, and each has a name of its own in its lab', () => {
    for (const lab of RECEIPT_LABS) {
      expect(lab.stages.map((stage) => stage.n)).toEqual(lab.stages.map((_, at) => at + 1))
      expect(lab.stages.map((stage) => stage.id)).toEqual(lab.stages.map((stage) => `${lab.id}.s${stage.n}`))
      expect(new Set(lab.stages.map((stage) => stage.name)).size).toBe(lab.stages.length)
      for (const stage of lab.stages) expect(stage.name).toMatch(/^\S.*\S$/)
    }
  })

  test("are ids of the schema's pattern, so that a challenge for each is a token the codec writes", () => {
    for (const stage of RECEIPT_STAGES) expect(stageIdSchema.safeParse(stage.id).success, stage.id).toBe(true)
    for (const lab of RECEIPT_LABS) expect(receiptLabIdSchema.safeParse(lab.id).success, lab.id).toBe(true)
  })

  test('are found by id, with the lab that lists them', () => {
    expect(stageOf('tr8.replay.s2')).toMatchObject({ n: 2, name: 'the BurstGPT replay', optional: false })
    expect(stageOf('tr8.replay.s9')).toBeUndefined()
    expect(stageOf('constructor')).toBeUndefined()
    expect(labForStage('tr8.replay.s2')?.id).toBe('tr8.replay')
    expect(labForStage('tr8.nothing.s1')).toBeUndefined()
    expect(labById('capstone.pair')?.stages).toHaveLength(2)
    expect(stageTitle('tr8.replay.s2')).toBe('tr8.replay.s2, the BurstGPT replay')
    expect(stageTitle('tr9.later.s1')).toBe('tr9.later.s1')
  })
})

describe('the labs', () => {
  test("are the course's labs that run on the learner's machine: a lane L or F artifact of a module, with a dot in its id", () => {
    const artifacts = MAP.modules.flatMap((module) => module.artifacts.map((artifact) => ({ module: module.id, ...artifact })))
    const local = artifacts.filter((artifact) => (artifact.lane === 'L' || artifact.lane === 'F') && artifact.id.includes('.'))
    expect(RECEIPT_LABS.map((lab) => [lab.id, lab.module, lab.lane])).toEqual(local.map((artifact) => [artifact.id, artifact.module, artifact.lane]))
  })

  test('are listed in the order of the course, TR0 to the capstone', () => {
    const order = MAP.modules.map((module) => module.id)
    const modules = RECEIPT_LABS.map((lab) => order.indexOf(lab.module))
    expect(modules.every((at) => at >= 0)).toBe(true)
    expect(modules).toEqual([...modules].sort((a, b) => a - b))
  })
})
