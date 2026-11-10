/*
 * W2-T08, rule 9, the physics floors (ARCHITECTURE §8.5 rule 9, ASSESSMENT §6.4): P1, a step against the time its weights take to read, and P3 (B13), the
 * throughput ceiling. The numbers are the hardware atlas's, found by the name NVML reports. A number that is too good fails with its bound printed, and
 * a GPU the atlas lacks has no floors: the rule says so and does not guess.
 *
 * The honest fixtures run on four H100s with 70 GB of weights: the floor is 70 GB × 80% [estimated] ÷ (4 × 3,350 GB/s) = 4,179,104 ns, and the honest
 * trace's steps last 12 ms and more.
 */
import { describe, expect, test } from 'bun:test'
import { findGpu, gpusOf, PEAK_MARGIN_PERMILLE, READ_PERMILLE, readFloorNs } from '@es/verify'
import { ATLAS } from '@/receipts/atlas'
import { edited, replayFixture, traceFixture, GPU_NAME, MODEL_BYTES } from './synthetic'
import type { Fixture } from './synthetic'
import { checkOf, verify } from './run'

const run = async (fixture: Fixture, over: Partial<Fixture['context']> = {}) => verify(fixture.bundle, { ...fixture.context, ...over })

describe('the atlas, as the floors read it', () => {
  test('finds a GPU by its name, exactly, and nothing else: an H100 NVL is not an H100', () => {
    expect(findGpu(ATLAS, 'NVIDIA H100 80GB HBM3')).toEqual({ name: 'NVIDIA H100 80GB HBM3', bandwidthGBps: 3350, peakTflops: 1979 })
    expect(findGpu(ATLAS, 'NVIDIA H100 NVL')).toBeUndefined()
    expect(findGpu(ATLAS, 'nvidia h100 80gb hbm3')).toBeUndefined()
    expect(findGpu([], GPU_NAME)).toBeUndefined()
  })

  test('adds the bandwidths and the peaks of the GPUs of a run, and fails the whole run on a name it lacks, once', () => {
    expect(gpusOf(ATLAS, [GPU_NAME, GPU_NAME])).toEqual({ ok: true, count: 2, bandwidthGBps: 6700, peakTflops: 3958 })
    expect(gpusOf(ATLAS, [GPU_NAME, 'NVIDIA B200', 'NVIDIA B200'])).toEqual({ ok: false, missing: ['NVIDIA B200'], count: 3 })
    expect(gpusOf(ATLAS, [])).toEqual({ ok: false, missing: [], count: 0 })
  })

  test('makes a floor of weight bytes over bandwidth: GB/s is bytes per ns, and the quotient is rounded down', () => {
    expect(readFloorNs(MODEL_BYTES, READ_PERMILLE, 4 * 3350)).toBe(4_179_104)
    expect(readFloorNs(1000, 1000, 3)).toBe(333)
    expect(READ_PERMILLE).toBe(800)
    expect(PEAK_MARGIN_PERMILLE).toBe(1250)
  })
})

describe('P1, a step against its floor', () => {
  test('passes the honest trace and prints the floor with how it was made', async () => {
    const outcome = await run(traceFixture())
    expect(checkOf(outcome, 'P1')?.bound).toBe('13 floors, and none is broken; every step lasts at least the floor, 70,000,000,000 weight bytes × 80% [estimated] ÷ 13,400 GB/s over 4 GPUs = 4,179,104 ns.')
  })

  test('adds the bandwidth of every GPU: the same trace on one GPU has a floor four times higher, and breaks it', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => (bundle.receipt.environment.gpus = bundle.receipt.environment.gpus.slice(0, 1))))
    expect(checkOf(outcome, 'P1')?.status).toBe('fail')
    expect(checkOf(outcome, 'P1')?.bound).toContain('70,000,000,000 weight bytes × 80% [estimated] ÷ 3,350 GB/s over 1 GPU = 16,716,417 ns')
  })

  test('takes the share of weights a stage declares: a mixture of experts reads far less than the file', async () => {
    const fixture = traceFixture()
    const onOne = edited(fixture, (bundle) => (bundle.receipt.environment.gpus = bundle.receipt.environment.gpus.slice(0, 1)))
    const declared = { 'tr3.profile.s5': { ...onOne.context.stages?.['tr3.profile.s5'], readPermille: 100 } }
    const outcome = await run(onOne, { stages: declared })
    expect(checkOf(outcome, 'P1')?.status).toBe('pass')
    expect(checkOf(outcome, 'P1')?.bound).toContain('× 10% [estimated]')
  })

  test('fails a GPU that the atlas lacks, and says that a name that is not listed is not guessed: a floor that naming an unlisted GPU dodges is no floor', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => bundle.receipt.environment.gpus.forEach((gpu) => (gpu.name = 'NVIDIA Example Accelerator'))))
    expect(checkOf(outcome, 'P1')).toEqual({
      id: 'P1',
      status: 'fail',
      bound: 'The hardware atlas has no entry for "NVIDIA Example Accelerator", so no floor can be made, and a name that is not listed is not guessed.',
    })
  })

  test('fails a receipt that names no GPU, and one that lists no model, since there is nothing to make the floor from', async () => {
    const none = await run(edited(traceFixture(), (bundle) => (bundle.receipt.environment.gpus = [])))
    expect(checkOf(none, 'P1')?.bound).toBe('The receipt names no GPU, and a floor is made from the GPU that ran.')
    const noModel = await run(edited(traceFixture(), (bundle) => (bundle.receipt.inputs = bundle.receipt.inputs.filter((input) => input.kind !== 'model'))))
    expect(checkOf(noModel, 'P1')?.bound).toBe('The receipt lists no model among its inputs, so there are no weight bytes to make a floor from.')
  })

  test('fails a trace with no step window: no step can be held to a floor', async () => {
    const outcome = await run(
      edited(traceFixture(), (bundle) => {
        const trace = bundle.artifacts.trace.data as { marks: unknown[] }
        trace.marks = []
      }),
    )
    expect(checkOf(outcome, 'P1')?.bound).toBe('The trace has no step window, so no step can be held to its floor.')
  })

  test('has nothing to bound in a receipt with no performance evidence, and the rule passes', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => ((bundle.receipt.artifacts = []), (bundle.artifacts = {}), (bundle.receipt.performance = undefined))))
    expect(outcome.rules[8]).toMatchObject({ rule: 9, id: 'floors', status: 'pass', summary: 'No check of this rule applies to the receipt.' })
  })
})

describe('P3 (B13), the throughput ceiling', () => {
  test('passes the honest replay and prints the ceiling with its two parts', async () => {
    const outcome = await run(replayFixture())
    expect(checkOf(outcome, 'P3')?.bound).toBe(
      '971 output tokens/s over 1,136 measured rows, against a ceiling of 15,314: memory 15,314 (64 sequences × 1 per step ÷ 4,179,104 ns) and compute 282,714 (7,916 TFLOPS peak with a margin of 25% [estimated], per 2 × the parameters, at least 17,500,000,000).',
    )
  })

  test('fails a log that emits more tokens a second than the memory allows: twenty times the output of the same requests', async () => {
    const outcome = await run(
      edited(replayFixture(), (bundle) => {
        const log = (bundle.artifacts['bench-log'] as unknown as { data: { rows: { outputTokens: number[] } } }).data
        log.rows.outputTokens = log.rows.outputTokens.map((n) => n * 20)
      }),
    )
    expect(checkOf(outcome, 'P3')?.status).toBe('fail')
    expect(checkOf(outcome, 'P3')?.bound).toMatch(/^[\d,]+ output tokens\/s over 1,136 measured rows, against a ceiling of 15,314: memory 15,314/)
  })

  test('takes the tokens a sequence may emit in a step from the stage: a proposer that speculates raises the ceiling by as many', async () => {
    const fixture = replayFixture()
    const stages = { 'tr8.replay.s2': { ...fixture.context.stages?.['tr8.replay.s2'], tokensPerSeqStep: 5 } }
    const outcome = await run(fixture, { stages })
    expect(checkOf(outcome, 'P3')?.bound).toContain('against a ceiling of 76,571: memory 76,571 (64 sequences × 5 per step')
  })

  test('fails a receipt that records no max_num_seqs, since the most a step can emit is then not known', async () => {
    const outcome = await run(edited(replayFixture(), (bundle) => delete bundle.receipt.environment.engineConfig))
    expect(checkOf(outcome, 'P3')?.bound).toBe('The receipt records no max_num_seqs, so the most tokens a step can emit is not known.')
  })

  test('fails a GPU that the atlas lacks, as P1 does', async () => {
    const outcome = await run(edited(replayFixture(), (bundle) => bundle.receipt.environment.gpus.forEach((gpu) => (gpu.name = 'NVIDIA Example Accelerator'))))
    expect(checkOf(outcome, 'P3')?.bound).toContain('The hardware atlas has no entry for "NVIDIA Example Accelerator"')
  })
})
