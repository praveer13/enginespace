/*
 * W2-T08, rule 9, the physics floors (ARCHITECTURE §8.5 rule 9, ASSESSMENT §6.4): P1, a step against the time its weights take to read, and P3 (B13), the
 * throughput ceiling. The numbers are the hardware atlas's, found by the name NVML reports. A number that is too good fails with its bound printed, and
 * a GPU the atlas lacks has no floors: the rule says so and does not guess.
 *
 * The honest fixtures run on four H100s with 70 GB of weights: the floor is 70 GB × 80% [estimated] ÷ (4 × 3,350 GB/s) = 4,179,104 ns, and the honest
 * trace's steps last 12 ms and more.
 *
 * What a floor is made from is what the site pins for the stage, and never what the receipt says of itself (the review of W2's grader track): the weight bytes
 * are the stage's pinned model (`StageDeclaration.model`) and the receipt's model inputs have to be exactly those files; the GPUs are the number the stage's engine
 * spans (`gpus`) out of the ones the fingerprint lists, which are all the machine has; and the receipt's `max_num_seqs` may not be above the most the stage's engine
 * runs (`maxNumSeqs`). A stage that pins none of them has the floor fail with that reason, as a stage with no workload has B1 fail.
 */
import { describe, expect, test } from 'bun:test'
import { findGpu, gpusNamed, gpusOf, PEAK_MARGIN_PERMILLE, READ_PERMILLE, readFloorNs } from '@es/verify'
import { ATLAS } from '@/receipts/atlas'
import { BESTIARY } from './bestiary'
import { edited, replayFixture, traceFixture, GPU_NAME, MODEL_BYTES, MODEL_PIN } from './synthetic'
import type { Fixture } from './synthetic'
import { checkOf, verify } from './run'

const run = async (fixture: Fixture, over: Partial<Fixture['context']> = {}) => verify(fixture.bundle, { ...fixture.context, ...over })

/** The trace fixture's context with what its stage declares changed: the stage's declaration, merged with `over`. */
const declaring = (fixture: Fixture, over: Record<string, unknown>): Partial<Fixture['context']> => ({
  stages: { [fixture.stage]: { ...fixture.context.stages?.[fixture.stage], ...over } } as Fixture['context']['stages'],
})
const withoutKeys = (fixture: Fixture, ...keys: string[]): Partial<Fixture['context']> => {
  const declared: Record<string, unknown> = { ...fixture.context.stages?.[fixture.stage] }
  for (const key of keys) delete declared[key]
  return { stages: { [fixture.stage]: declared } as Fixture['context']['stages'] }
}

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

  test('adds only the GPUs a run used when it is told how many, the fastest of the ones listed: a floor is never stricter than the run can bear', () => {
    const l4 = 'NVIDIA L4'
    const h100 = GPU_NAME
    expect(gpusOf(ATLAS, [h100, h100, h100, h100], 2)).toEqual({ ok: true, count: 2, bandwidthGBps: 6700, peakTflops: 3958 })
    expect(gpusOf(ATLAS, [l4, h100, l4], 1)).toEqual({ ok: true, count: 1, bandwidthGBps: 3350, peakTflops: 1979 })
    expect(gpusOf(ATLAS, [l4, h100, l4], 2)).toEqual({ ok: true, count: 2, bandwidthGBps: 3650, peakTflops: 2221.5 })
    // The sum never takes more than the machine has, and a name the atlas lacks still fails the whole run.
    expect(gpusOf(ATLAS, [h100], 4)).toEqual({ ok: true, count: 1, bandwidthGBps: 3350, peakTflops: 1979 })
    expect(gpusOf(ATLAS, [h100, 'NVIDIA B200'], 1)).toEqual({ ok: false, missing: ['NVIDIA B200'], count: 2 })
  })

  test('adds the slowest GPUs of the list when it is told to, and the GPUs of one name when the evidence names it: a faster name typed into the list lowers neither', () => {
    const l4 = 'NVIDIA L4'
    const h200 = 'NVIDIA H200'
    expect(gpusOf(ATLAS, [h200, h200, GPU_NAME, GPU_NAME], 2, 'slowest')).toEqual({ ok: true, count: 2, bandwidthGBps: 6700, peakTflops: 3958 })
    expect(gpusOf(ATLAS, [l4, GPU_NAME, h200], 1, 'slowest')).toEqual({ ok: true, count: 1, bandwidthGBps: 300, peakTflops: 242.5 })
    expect(gpusNamed(ATLAS, [GPU_NAME, GPU_NAME, h200], GPU_NAME, 2)).toEqual({ ok: true, count: 2, bandwidthGBps: 6700, peakTflops: 3958 })
    expect(gpusNamed(ATLAS, [GPU_NAME, h200], GPU_NAME, 2)).toEqual({ ok: false, missing: [], count: 2, listed: 1 })
    expect(gpusNamed(ATLAS, [GPU_NAME], 'NVIDIA B200', 1)).toEqual({ ok: false, missing: ['NVIDIA B200'], count: 1 })
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

  test('adds the bandwidth of the GPUs the stage runs on: the same trace on one GPU has a floor four times higher, and breaks it', async () => {
    const fixture = traceFixture()
    const outcome = await run(fixture, declaring(fixture, { gpus: 1 }))
    expect(checkOf(outcome, 'P1')?.status).toBe('fail')
    expect(checkOf(outcome, 'P1')?.bound).toContain('70,000,000,000 weight bytes × 80% [estimated] ÷ 3,350 GB/s over 1 GPU = 16,716,417 ns')
  })

  test('is held to one GPU by a stage that declares no count: a floor is made from the fewest GPUs a run can have used, and never from the machine\'s list', async () => {
    const fixture = traceFixture()
    const outcome = await run(fixture, withoutKeys(fixture, 'gpus'))
    expect(checkOf(outcome, 'P1')?.bound).toContain('÷ 3,350 GB/s over 1 GPU = 16,716,417 ns')
  })

  test('is not weakened by a fingerprint that lists more GPUs than the run used: sixteen H100s listed, four used, and the floor is the four\'s', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => (bundle.receipt.environment.gpus = Array.from({ length: 16 }, () => ({ ...bundle.receipt.environment.gpus[0] })))))
    expect(checkOf(outcome, 'P1')?.status).toBe('pass')
    expect(checkOf(outcome, 'P1')?.bound).toContain('÷ 13,400 GB/s over 4 GPUs = 4,179,104 ns')
  })

  test('fails a receipt that lists fewer GPUs than the stage runs on: it is not the run that the stage declares', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => (bundle.receipt.environment.gpus = bundle.receipt.environment.gpus.slice(0, 1))))
    expect(checkOf(outcome, 'P1')).toEqual({
      id: 'P1',
      status: 'fail',
      bound: 'The receipt lists 1 GPU, and tr3.profile.s5 runs on 4, so it is not the run that the stage declares and no floor is made from it.',
    })
  })

  test('takes the share of weights a stage declares: a mixture of experts reads far less than the file', async () => {
    const fixture = traceFixture()
    const outcome = await run(fixture, declaring(fixture, { gpus: 1, readPermille: 100 }))
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

  test('fails a receipt that names no GPU, since there is nothing to make the floor from', async () => {
    const none = await run(edited(traceFixture(), (bundle) => (bundle.receipt.environment.gpus = [])))
    expect(checkOf(none, 'P1')?.bound).toBe('The receipt names no GPU, and a floor is made from the GPU that ran.')
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

describe('the model that a floor is made from is the one the site pins for the stage', () => {
  const [pinned] = MODEL_PIN
  const bytesOf = (bundle: Fixture['bundle']): number => bundle.receipt.inputs.filter((input) => input.kind === 'model').reduce((total, input) => total + input.bytes, 0)

  test('is not the figure in the receipt: a smaller size typed into the inputs leaves the floor where the pinned model puts it, and the receipt is refused with both printed', async () => {
    const fixture = traceFixture()
    expect(bytesOf(fixture.bundle)).toBe(MODEL_BYTES)
    const typed = edited(fixture, (bundle) => {
      for (const input of bundle.receipt.inputs) if (input.kind === 'model') input.bytes = 1_000_000
    })
    const outcome = await run(typed)
    expect(checkOf(outcome, 'P1')).toEqual({
      id: 'P1',
      status: 'fail',
      bound: `The receipt lists the model input "${pinned.name}" with 1,000,000 bytes (sha256 ${pinned.sha256.slice(0, 8)}…), and tr3.profile.s5 pins "${pinned.name}" with 70,000,000,000 bytes (sha256 ${pinned.sha256.slice(0, 8)}…); the floor is made from the pinned one.`,
    })
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
  })

  test('is the same for P3: a smaller model typed into the inputs of a replay does not raise its ceiling', async () => {
    const outcome = await run(
      edited(replayFixture(), (bundle) => {
        for (const input of bundle.receipt.inputs) if (input.kind === 'model') input.bytes = 1_000_000
      }),
    )
    expect(checkOf(outcome, 'P3')?.status).toBe('fail')
    expect(checkOf(outcome, 'P3')?.bound).toMatch(/^The receipt lists the model input "[^"]+" with 1,000,000 bytes/)
  })

  test('fails a model input of another hash than the pinned file\'s, though the size is the same: another model of the same size is not the pinned one', async () => {
    const outcome = await run(
      edited(traceFixture(), (bundle) => {
        for (const input of bundle.receipt.inputs) if (input.kind === 'model') input.sha256 = '1'.repeat(64)
      }),
    )
    expect(checkOf(outcome, 'P1')?.status).toBe('fail')
    expect(checkOf(outcome, 'P1')?.bound).toContain(`with 70,000,000,000 bytes (sha256 11111111…), and tr3.profile.s5 pins "${pinned.name}" with 70,000,000,000 bytes (sha256 ${pinned.sha256.slice(0, 8)}…)`)
  })

  test('fails a model input that the stage does not pin: another model, under whatever name', async () => {
    const outcome = await run(
      edited(traceFixture(), (bundle) => {
        for (const input of bundle.receipt.inputs) if (input.kind === 'model') Object.assign(input, { name: 'Example/another-model', sha256: '3'.repeat(64), bytes: 20_000_000_000 })
      }),
    )
    expect(checkOf(outcome, 'P1')?.bound).toBe('The receipt lists the model input "Example/another-model" with 20,000,000,000 bytes (sha256 33333333…), which tr3.profile.s5 does not pin: the floor is made from the pinned model.')
  })

  test('takes a name as a label and a hash and a size as the file: the pinned file under another name is the pinned file', async () => {
    const outcome = await run(
      edited(traceFixture(), (bundle) => {
        for (const input of bundle.receipt.inputs) if (input.kind === 'model') input.name = 'A copy of the same weights'
      }),
    )
    expect(checkOf(outcome, 'P1')?.status).toBe('pass')
  })

  test('fails a receipt that leaves the pinned file out of its inputs, and one that lists a model file besides it', async () => {
    const without = await run(edited(traceFixture(), (bundle) => (bundle.receipt.inputs = bundle.receipt.inputs.filter((input) => input.kind !== 'model'))))
    expect(checkOf(without, 'P1')?.bound).toBe(`tr3.profile.s5 pins the model file "${pinned.name}" with 70,000,000,000 bytes (sha256 ${pinned.sha256.slice(0, 8)}…), and the receipt lists no model input like it.`)
    const extra = await run(
      edited(traceFixture(), (bundle) => {
        bundle.receipt.inputs.push({ name: 'Example/draft-model', kind: 'model', sha256: '2'.repeat(64), bytes: 1_000_000 })
      }),
    )
    expect(checkOf(extra, 'P1')?.bound).toMatch(/^The receipt lists the model input "Example\/draft-model" with 1,000,000 bytes \(sha256 22222222…\), which tr3\.profile\.s5 does not pin/)
  })

  test('takes a model of several files: the weight bytes are the pinned files\' together, and each has to be among the inputs', async () => {
    const fixture = traceFixture()
    const half = MODEL_BYTES / 2
    const parts = [
      { name: 'Example/model-70B-fp8/shard-1', sha256: 'a'.repeat(64), bytes: half },
      { name: 'Example/model-70B-fp8/shard-2', sha256: 'b'.repeat(64), bytes: half },
    ]
    const sharded = edited(fixture, (bundle) => {
      bundle.receipt.inputs = [...parts.map((part) => ({ ...part, kind: 'model' as const })), ...bundle.receipt.inputs.filter((input) => input.kind !== 'model')]
    })
    const outcome = await run(sharded, declaring(fixture, { model: parts }))
    expect(checkOf(outcome, 'P1')?.status).toBe('pass')
    expect(checkOf(outcome, 'P1')?.bound).toContain('70,000,000,000 weight bytes')
    const missing = await run(sharded, declaring(fixture, { model: [...parts, { name: 'Example/model-70B-fp8/shard-3', sha256: 'c'.repeat(64), bytes: 1 }] }))
    expect(checkOf(missing, 'P1')?.bound).toContain('pins the model file "Example/model-70B-fp8/shard-3"')
  })

  test('is needed: a stage that pins no model has P1 and P3 fail with that reason, and the receipt\'s own figure is not taken in its place', async () => {
    const trace = traceFixture()
    const none = await run(trace, withoutKeys(trace, 'model'))
    expect(checkOf(none, 'P1')?.status).toBe('fail')
    expect(checkOf(none, 'P1')?.bound).toMatch(/^This site declares no model for tr3\.profile\.s5, so there are no weight bytes to make a floor from/)
    const replay = replayFixture()
    const empty = await run(replay, declaring(replay, { model: [] }))
    expect(checkOf(empty, 'P3')?.bound).toMatch(/^This site declares no model for tr8\.replay\.s2/)
    const undeclared = await run(trace, { stages: {} })
    expect(checkOf(undeclared, 'P1')?.bound).toMatch(/^This site declares no model for tr3\.profile\.s5/)
  })
})

describe('a faster GPU typed into the receipt\'s list (the second review)', () => {
  /** Four H200s typed in beside the four H100s, the trace untouched: the honest floor must not move. */
  const typed = (bundle: Fixture['bundle']): void => {
    for (let i = 0; i < 4; i += 1) bundle.receipt.environment.gpus.push({ ...bundle.receipt.environment.gpus[0], name: 'NVIDIA H200' })
  }

  test('does not lower the floor of a trace: P1 prints the H100 floor, and the honest trace passes with it', async () => {
    const outcome = await run(edited(traceFixture(), typed))
    expect(checkOf(outcome, 'P1')?.status).toBe('pass')
    expect(checkOf(outcome, 'P1')?.bound).toContain('÷ 13,400 GB/s over 4 GPUs = 4,179,104 ns')
  })

  test('fails a trace that is under the H100 floor and over the H200 one', async () => {
    const fixture = BESTIARY.find((forgery) => forgery.id === 'faster-gpu-typed')?.forge(traceFixture())
    if (fixture === undefined) throw new Error('the bestiary has no such forgery')
    const outcome = await run(fixture)
    expect(checkOf(outcome, 'P1')?.status).toBe('fail')
    expect(checkOf(outcome, 'P1')?.bound).toMatch(/÷ 13,400 GB\/s over 4 GPUs = 4,179,104 ns/)
    // The same trace against the floor that the typed list alone would give is clear of it: the forgery is a real one, and only the source of the GPUs stops it.
    expect(readFloorNs(MODEL_BYTES, READ_PERMILLE, 4 * 4800)).toBeLessThan(4_179_104)
  })

  test('fails a trace that names a GPU that the receipt lists too few times, and says so', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => (bundle.receipt.environment.gpus = bundle.receipt.environment.gpus.map((gpu, at) => (at < 3 ? gpu : { ...gpu, name: 'NVIDIA H200' })))))
    expect(checkOf(outcome, 'P1')?.status).toBe('fail')
    expect(checkOf(outcome, 'P1')?.bound).toContain('and the receipt lists 3 GPUs of that name')
  })

  test('does not raise the ceiling of a benchmark log, which names no GPU: P3 takes the slowest of the GPUs listed', async () => {
    const control = checkOf(await run(replayFixture()), 'P3')?.bound
    const typedIn = checkOf(await run(edited(replayFixture(), typed)), 'P3')?.bound
    expect(typedIn).toBe(control)
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
    const outcome = await run(fixture, declaring(fixture, { tokensPerSeqStep: 5 }))
    expect(checkOf(outcome, 'P3')?.bound).toContain('against a ceiling of 76,571: memory 76,571 (64 sequences × 5 per step')
  })

  test('fails a receipt that records no max_num_seqs, since the most a step can emit is then not known', async () => {
    const outcome = await run(edited(replayFixture(), (bundle) => delete bundle.receipt.environment.engineConfig))
    expect(checkOf(outcome, 'P3')?.bound).toBe('The receipt records no max_num_seqs, so the most tokens a step can emit is not known.')
  })

  test('holds the receipt\'s max_num_seqs to the most the stage\'s engine runs: a number typed larger lifts the memory ceiling, and fails', async () => {
    const lifted = await run(
      edited(replayFixture(), (bundle) => {
        if (bundle.receipt.environment.engineConfig !== undefined) bundle.receipt.environment.engineConfig.maxNumSeqs = 100_000
      }),
    )
    expect(checkOf(lifted, 'P3')).toEqual({
      id: 'P3',
      status: 'fail',
      bound: 'The receipt records max_num_seqs 100,000, and the engine of tr8.replay.s2 never runs more than 64 sequences at once, so the ceiling is not made from the receipt\'s figure.',
    })
    const fewer = await run(
      edited(replayFixture(), (bundle) => {
        if (bundle.receipt.environment.engineConfig !== undefined) bundle.receipt.environment.engineConfig.maxNumSeqs = 32
      }),
    )
    expect(checkOf(fewer, 'P3')?.bound).toContain('32 sequences × 1 per step')
  })

  test('needs the stage to declare that most, as it needs its workload: without it P3 fails with that reason', async () => {
    const fixture = replayFixture()
    const outcome = await run(fixture, withoutKeys(fixture, 'maxNumSeqs'))
    expect(checkOf(outcome, 'P3')?.bound).toBe('This site declares no most for max_num_seqs for tr8.replay.s2, so the receipt\'s figure for it cannot be held to anything.')
  })

  test('fails a GPU that the atlas lacks, as P1 does', async () => {
    const outcome = await run(edited(replayFixture(), (bundle) => bundle.receipt.environment.gpus.forEach((gpu) => (gpu.name = 'NVIDIA Example Accelerator'))))
    expect(checkOf(outcome, 'P3')?.bound).toContain('The hardware atlas has no entry for "NVIDIA Example Accelerator"')
  })

  test('is not weakened by GPUs listed beyond the ones the stage runs on: sixteen listed, four used, and the ceiling is the four\'s', async () => {
    const outcome = await run(edited(replayFixture(), (bundle) => (bundle.receipt.environment.gpus = Array.from({ length: 16 }, () => ({ ...bundle.receipt.environment.gpus[0] })))))
    expect(checkOf(outcome, 'P3')?.status).toBe('pass')
    expect(checkOf(outcome, 'P3')?.bound).toContain('against a ceiling of 15,314')
  })
})
