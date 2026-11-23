/*
 * A synthetic receipt and bundle for the tests of the receipt family (W2-T01). No machine ran them: every value is invented, the hosts
 * are called nothing in particular, and the receipt's notes say so. The hashes are real, though: each artifact's SHA-256 is of its canonical
 * bytes, so a test that checks the integrity of the sample has an honest sample to check.
 */
import { createHash } from 'node:crypto'
import { formatChallenge } from '@es/schema/challenge'
import type { Bundle } from '@es/schema/bundle'
import type { Receipt } from '@es/schema/receipt'
import type { TraceDocument } from '@es/schema/trace'
import { canonicalJson } from '../../packages/sim/core/json'
import { traceBuilder, traceToJson } from '../../packages/sim/trace'

export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')

/** A trace of two steps: the engine's main thread launches a kernel in each, and the GPU runs it. Labelled synthetic, as every made-up trace is. */
export function sampleTrace(): TraceDocument {
  const b = traceBuilder()
  const cpu = b.track('cpu-thread', 'engine main thread')
  const api = b.track('cuda-api', 'CUDA calls')
  const gpu = b.track('gpu-stream', 'stream 7')
  b.mark(0, 'step')
  b.mark(100_000, 'step')
  b.mark(200_000, 'step')
  for (let step = 0; step < 2; step += 1) {
    const at = step * 100_000
    b.span(cpu, at, 30_000, 'schedule', 'cpu')
    const launch = b.span(api, at + 30_000, 2_000, 'cudaLaunchKernel', 'launch', step + 1)
    const kernel = b.span(gpu, at + 35_000, 50_000, 'decode_attention', 'kernel', step + 1)
    b.flow(launch, kernel, 'launch')
  }
  return traceToJson(b.build({ source: 'synthetic', synthetic: true, engine: 'example-engine', version: '1.0.0', gpu: 'Example GPU' })) as unknown as TraceDocument // the readonly arrays of the reader's type are the schema's mutable ones
}

const TOKEN = formatChallenge({ stage: 'tr3.profile.s2', seed: 0x0badc0de, nonce: 'ABCDEFGHJKLMNPQR', issuedOn: '20261104' })

/** The artifacts of the sample: a trace in JSON, a log as text, and a capture too large to travel, listed by its hash only. */
export function sampleArtifacts(): Bundle['artifacts'] {
  return {
    trace: { encoding: 'json', data: sampleTrace() },
    log: { encoding: 'text', data: 'server started\nready\n' },
  }
}

/** A receipt that the schema takes, with its artifact entries hashed over the bytes of `sampleArtifacts`. */
export function sampleReceipt(): Receipt {
  const artifacts = sampleArtifacts()
  const trace = canonicalJson(artifacts.trace.data)
  const log = artifacts.log.data as string
  return {
    schema: 'enginespace/receipt@1',
    lab: 'tr3.profile',
    stage: 'tr3.profile.s2',
    challenge: { token: TOKEN, seed: 0x0badc0de, nonce: 'ABCDEFGHJKLMNPQR', issuedOn: '20261104' },
    createdAt: '2026-11-09T12:30:00Z',
    grader: { name: 'enginespace-grader', version: '0.1.0', sourceSha256: sha256('example grader source') },
    environment: {
      host: { kind: 'other', os: 'Example Linux 1.0', kernel: '6.0.0-example', arch: 'x86_64', cpu: 'Example CPU', cores: 16, ramBytes: 68_719_476_736, container: true },
      gpus: [
        {
          name: 'Example GPU 24GB',
          memoryBytes: 25_769_803_776,
          computeCapability: '8.9',
          smCount: 128,
          maxSmClockMhz: 2520,
          maxMemClockMhz: 10_501,
          powerLimitMw: 450_000,
          pcieGen: 4,
          pcieWidth: 16,
          mig: 'unsupported',
          ecc: 'disabled',
          virtualization: 'none',
        },
      ],
      driver: { version: '580.82.07', cudaVersion: '13.0' },
      python: '3.12.7',
      torch: { version: '2.14.0', cuda: '13.0', cudnn: '9.10.2' },
      engine: { name: 'vllm', version: '0.33.0', commit: '4ba787ec9959e566d3b587a796dff07673324da5', recordSha256: sha256('example RECORD') },
      engineConfig: { runner: 'MRV2', graphMode: 'FULL_AND_PIECEWISE', asyncScheduling: true, attentionBackend: 'FLASH_ATTN', maxNumBatchedTokens: 8192, maxNumSeqs: 256 },
      libs: [
        { name: 'flashinfer-python', version: '0.7.2.post1' },
        { name: 'xgrammar', version: '0.2.8' },
        { name: 'triton', version: '3.4.0' },
        { name: 'transformers', version: '5.19.0' },
      ],
      envVars: { VLLM_LOGGING_LEVEL: 'INFO' },
    },
    pins: { lockSha256: sha256('example course.lock.json'), envLockSha256: sha256('example uv.lock'), onPin: true, offPin: [] },
    inputs: [
      { name: 'Example/model-0.6B', kind: 'model', revision: '0123456789abcdef0123456789abcdef01234567', sha256: sha256('example model'), bytes: 1_200_000_000 },
      { name: 'prompts', kind: 'prompts', sha256: sha256('example prompts'), bytes: 4096 },
    ],
    artifacts: [
      { id: 'trace', kind: 'trace', format: 'enginespace/trace@1', sha256: sha256(trace), bytes: Buffer.byteLength(trace), inBundle: true },
      { id: 'log', kind: 'log', format: 'text', sha256: sha256(log), bytes: Buffer.byteLength(log), inBundle: true },
      { id: 'capture', kind: 'report', format: 'binary', sha256: sha256('example capture'), bytes: 987_654_321, inBundle: false },
    ],
    checks: [
      { id: 'agreement', kind: 'correctness', pass: true, value: 0.995, bound: 0.99, n: 200, detail: 'teacher-forced agreement over 200 positions', refSha256: sha256('example bank') },
      { id: 'runner', kind: 'environment', pass: true, detail: 'MRV2 ran' },
      { id: 'engine-integrity', kind: 'property', pass: true, tolerance: 0, detail: '' },
    ],
    performance: { kind: 'trace', claimed: { trace: { steps: 2, gpuBusyNs: 100_000 } } },
    provenance: { assisted: 'none', agent: false, guard: 'on' },
    notes: 'A synthetic receipt made by tests/schema/receipt-support.ts. No machine ran it.',
    ext: { example: true },
  }
}

/** A bundle of the sample receipt and the artifacts that it lists as travelling. */
export function sampleBundle(): Bundle {
  return { schema: 'enginespace/bundle@1', receipt: sampleReceipt(), artifacts: sampleArtifacts() }
}
