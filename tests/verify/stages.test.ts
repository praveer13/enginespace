/*
 * W2-T08: the stage table of packages/verify/stages.ts is ASSESSMENT §5.9's (ARCHITECTURE §8.5 rule 10). ASSESSMENT owns the table, and the code is its
 * transcription, so this file reads the document and fails when the two part:
 *
 *   - The stages are the same ones, none more and none fewer, and the labs of src/receipts/labs.ts list the same.
 *   - A stage requires a grader-attested ("A:") or a browser-re-checked ("R:") check exactly when §5.9's cell for it says so. One stage differs on
 *     purpose: tr4.sweep.s4 is "its own KC at full weight", and requires what s2 and s3 do.
 *   - A stage that requires nothing earns practice credit, which §5.9 says of its optional stages.
 *   - Every check a stage requires of the browser is built (the registry has it) or pending, with a task that TRACKER.md has; none is both, and none is
 *     neither. When a task builds a check, it moves from `PENDING` to the registry, and this test holds the move to a name that both know.
 */
import { describe, expect, test } from 'bun:test'
import { ALIASES, canonical, CHECK_IDS, isPractice, PENDING, STAGES, stageRow } from '@es/verify'
import { RECEIPT_STAGES } from '@/receipts/labs'
import { backticked, between, read, tableRows, trackerTasks } from '../ci/support'

/** §5.9's rows, one for each stage: whether its required cell names an A check and an R check. A row may list two stages. */
function assessment(): Map<string, { a: boolean; r: boolean; none: boolean }> {
  const table = between(read('docs/ASSESSMENT.md'), '### 5.9 Required checks per stage', '## 6.')
  const out = new Map<string, { a: boolean; r: boolean; none: boolean }>()
  for (const [stages, required] of tableRows(table)) {
    let lab = ''
    for (const name of backticked(stages)) {
      const id = name.startsWith('.') ? `${lab}${name}` : name
      lab = id.slice(0, id.lastIndexOf('.'))
      out.set(id, { a: /(^|[ ;])A:/.test(required), r: /(^|[ ;])R:/.test(required), none: required.startsWith('—') })
    }
  }
  return out
}

describe('the stages', () => {
  test('are ASSESSMENT §5.9\'s and the labs\', none more and none fewer, each once', () => {
    const ids = STAGES.map((stage) => stage.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...assessment().keys()].sort())
    expect([...ids].sort()).toEqual(RECEIPT_STAGES.map((stage) => stage.id).sort())
  })

  test('require a grader check or a browser check exactly when §5.9 names one in the stage\'s cell', () => {
    const rows = assessment()
    for (const stage of STAGES) {
      const row = rows.get(stage.id)
      if (row === undefined) throw new Error(`§5.9 has no row for ${stage.id}`)
      if (stage.id === 'tr4.sweep.s4') {
        // "— (its own KC at full weight; not required for completion)" and "as s2 and s3": the checks of s2 and s3, at full weight.
        expect([stage.id, stage.attested.length > 0, stage.rechecked.length > 0]).toEqual([stage.id, true, true])
        continue
      }
      expect([stage.id, 'A', stage.attested.length > 0]).toEqual([stage.id, 'A', row.a])
      expect([stage.id, 'R', stage.rechecked.length > 0]).toEqual([stage.id, 'R', row.r])
    }
  })

  test('earn practice credit exactly when they require nothing, which are the labs\' optional stages but for tr4.sweep.s4', () => {
    const practice = STAGES.filter(isPractice).map((stage) => stage.id)
    const optional = RECEIPT_STAGES.filter((stage) => stage.optional).map((stage) => stage.id)
    expect(practice.sort()).toEqual(optional.filter((id) => id !== 'tr4.sweep.s4').sort())
    expect(practice).toEqual(['tr0.forward.s1', 'tr1.fork.s3', 'tr3.profile.s1', 'tr3.profile.s5', 'tr5b.connector.s4', 'tr8.replay.s1', 'tr8.replay.s3'])
  })

  test('name no check twice in a row, and keep what is required apart from what is optional', () => {
    for (const stage of STAGES) {
      for (const list of [stage.attested, stage.rechecked, stage.optional, stage.captured]) expect([stage.id, new Set(list).size]).toEqual([stage.id, list.length])
      expect([stage.id, stage.optional.filter((id) => stage.attested.includes(id))]).toEqual([stage.id, []])
    }
  })
})

describe('the checks a stage requires of the browser', () => {
  const built = new Set(CHECK_IDS)
  const named = [...new Set(STAGES.flatMap((stage) => [...stage.rechecked, ...stage.captured]).filter((id) => id !== '*' && id !== 'evidence').map(canonical))]

  test('are each built or pending, never both and never neither', () => {
    for (const id of named) {
      const isBuilt = built.has(id)
      const isPending = Object.hasOwn(PENDING, id)
      expect([id, isBuilt !== isPending]).toEqual([id, true])
    }
  })

  test('are pending on a task that TRACKER.md has, or on W3\'s, and an alias is a check that is built', () => {
    const tasks = trackerTasks()
    for (const [id, task] of Object.entries(PENDING)) expect([id, task, tasks.has(task)]).toEqual([id, task, true])
    for (const [alias, id] of Object.entries(ALIASES)) expect([alias, built.has(id)]).toEqual([alias, true])
  })

  test('are the checks of ASSESSMENT\'s tables for a benchmark and a trace: B1 to B14 but B11, T1 to T10 with T9 as P1, and the cross-checks', () => {
    expect(CHECK_IDS).toEqual(expect.arrayContaining(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B12', 'B14', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T10', 'X4', 'P1', 'P3']))
    expect(CHECK_IDS).not.toContain('B11')
    expect(canonical('T9')).toBe('P1')
    expect(canonical('B13')).toBe('P3')
    expect(canonical('B6')).toBe('B6')
  })

  test('make tr8.replay.s2 and the stages of the flagship receipts as ASSESSMENT writes them', () => {
    const row = stageRow('tr8.replay.s2')
    expect(row?.attested).toEqual(['teacher-forced'])
    expect(row?.rechecked.map(canonical)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B12', 'P3', 'B14'])
    expect(stageRow('tr3.profile.s2')).toEqual(stageRow('tr3.profile.s4') && { ...stageRow('tr3.profile.s4'), id: 'tr3.profile.s2' })
    expect(stageRow('tr3.profile.s2')?.rechecked.map(canonical)).toEqual(['runner-log', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'P1', 'T10', 'X1', 'X4'])
    expect(stageRow('tr9.later.s1')).toBeUndefined()
  })
})
