/*
 * W0-T12 acceptance check 5: the host presets carry [estimated] and a card line.
 *
 * The host card is the CPU's cost per phase of an engine step (ARCHITECTURE §5.3, WORLD §2.11). Until W2-T22 fits it to the owner's
 * traces, every value is an [estimated] preset, and every screen that shows a host µs says so, so the check is on the data: each
 * preset is tagged, carries the sentence the notional-machine card prints, and has exactly the fields ARCHITECTURE §5.3 lists (read
 * from that document here, so a field added to one and not the other fails).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HOST_PRESETS, hostPreset, physicsRow } from '../../packages/sim'
import type { HostCard, RunnerPresetId } from '../../packages/sim'

const root = path.resolve(import.meta.dirname, '../..')
const architecture = readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8')

/** The field names of `export interface HostCard { … }` in ARCHITECTURE §5.3. */
function documentedFields(): string[] {
  const start = architecture.indexOf('export interface HostCard {')
  const end = architecture.indexOf('\n}', start)
  if (start < 0 || end < 0) throw new Error('ARCHITECTURE.md no longer has `export interface HostCard {`')
  return [...architecture.slice(start, end).matchAll(/(\w+): (?:Us|number)\b/g)].map((match) => match[1]).sort()
}

const ids: RunnerPresetId[] = ['mrv2', 'v1']

describe('the host presets', () => {
  test('are the MRV2 preset, which is vLLM\'s default at the pin, and the legacy V1 preset (ARCHITECTURE §5.3, D-041)', () => {
    expect(Object.keys(HOST_PRESETS).sort()).toEqual(['mrv2', 'v1'])
    for (const id of ids) {
      expect(hostPreset(id)).toBe(HOST_PRESETS[id])
      expect(HOST_PRESETS[id].id).toBe(id)
      expect(HOST_PRESETS[id].label.length).toBeGreaterThan(0)
    }
  })

  test('carry the [estimated] tag', () => {
    for (const id of ids) expect(HOST_PRESETS[id].tag).toBe('estimated')
  })

  test('carry a card line that says the values are [estimated], not fitted, and names the task that will fit them', () => {
    for (const id of ids) {
      const { cardLine } = HOST_PRESETS[id]
      expect(cardLine).toContain('[estimated]')
      expect(cardLine).toContain('not fitted')
      expect(cardLine).toContain('W2-T22')
      expect(cardLine).toContain('estimated"')
    }
    // Each line names its own runner.
    expect(HOST_PRESETS.mrv2.cardLine).toContain('MRV2')
    expect(HOST_PRESETS.v1.cardLine).toContain('V1')
    expect(HOST_PRESETS.mrv2.cardLine).not.toBe(HOST_PRESETS.v1.cardLine)
  })

  test('have exactly the fields of the HostCard in ARCHITECTURE §5.3, all integers, and at least one kernel per layer', () => {
    const fields = documentedFields()
    expect(fields).toHaveLength(11)
    for (const id of ids) {
      const card = HOST_PRESETS[id].card
      expect(Object.keys(card).sort()).toEqual(fields)
      for (const [name, value] of Object.entries(card)) {
        expect(Number.isSafeInteger(value) && value >= 0, `${id}.${name}`).toBe(true)
      }
      expect(card.kernelsPerLayer).toBeGreaterThanOrEqual(1)
      expect(card.graphReplayUs).toBeGreaterThan(0)
    }
  })

  test('differ where the runners differ and nowhere else: MRV2 prepares and samples on the GPU, so those three costs are lower', () => {
    const v1: HostCard = HOST_PRESETS.v1.card
    const mrv2: HostCard = HOST_PRESETS.mrv2.card
    const differing = (Object.keys(v1) as (keyof HostCard)[]).filter((name) => v1[name] !== mrv2[name]).sort()
    expect(differing).toEqual(['prepPerTokenUs', 'samplePerSeqUs', 'syncUs'])
    for (const name of differing) expect(mrv2[name]).toBeLessThan(v1[name])
  })

  test('anchor the legacy runner\'s per-sequence phases on S5\'s fitted host term: schedule plus sample is 61 µs, which is t_seq rounded', () => {
    const tSeq = physicsRow('h100-vllm-0-10-2-fp8').spec.params.seqUs
    const v1 = HOST_PRESETS.v1.card
    expect(v1.schedulePerSeqUs + v1.samplePerSeqUs).toBe(Math.round(tSeq))
    expect(Math.round(tSeq)).toBe(61)
  })

  test('are frozen, so a model that wants other costs must copy a card', () => {
    expect(Object.isFrozen(HOST_PRESETS)).toBe(true)
    for (const id of ids) {
      expect(Object.isFrozen(HOST_PRESETS[id])).toBe(true)
      expect(Object.isFrozen(HOST_PRESETS[id].card)).toBe(true)
      expect(() => {
        ;(HOST_PRESETS[id].card as { ipcUs: number }).ipcUs = 1
      }).toThrow(TypeError)
    }
  })
})
