/*
 * A tape of as many spans as a long capture holds, for measuring the viewer (TRACKER W1-T09: "panning 100k spans holds at least 30
 * fps"). It is not a model of anything: a step is a schedule frame with a prepare frame nested in it, a launch call and a kernel for
 * each of 24 kernels, a copy, and a sync, with seeded lengths, and a bell at the head of each step. It exists to be big, and the
 * route reads it only in a test build (`?spans=`), so a production build carries none of it.
 */
import { between, rngFor } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { traceBuilder } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'

const KERNELS_PER_STEP = 24

/** A synthetic tape with at least `count` spans, in whole steps. The same seed and count give the same tape. */
export function denseTrace(seed: Seed, count: number): EsTrace {
  const rng = rngFor(seed, 'trace/dense')
  const b = traceBuilder()
  const cpu = b.track('cpu-thread', 'engine core main thread')
  const api = b.track('cuda-api', 'CUDA API')
  const gpu = b.track('gpu-stream', 'GPU stream 0')
  let t = 1_000
  let made = 0
  let corr = 0
  while (made < count) {
    b.mark(t, 'step')
    const schedule = between(rng, 30_000, 60_000)
    b.span(cpu, t, schedule, 'schedule', 'schedule')
    b.span(cpu, t + 2_000, schedule - 8_000, 'prepare', 'prepare')
    made += 2
    let at = t + schedule
    const launches: number[] = []
    const first = corr
    for (let k = 0; k < KERNELS_PER_STEP; k++) {
      const call = between(rng, 3_000, 6_000)
      launches.push(b.span(api, at, call, 'cudaLaunchKernel', 'launch', corr++))
      at += call + between(rng, 200, 900)
      made++
    }
    let cursor = t + schedule + 4_000
    for (let k = 0; k < KERNELS_PER_STEP; k++) {
      const length = between(rng, 12_000, 140_000)
      const kernel = b.span(gpu, cursor, length, k % 9 === 8 ? 'down_proj' : 'qkv_proj', 'kernel', first + k)
      b.flow(launches[k], kernel, 'launch')
      cursor += length
      made++
    }
    b.span(gpu, cursor, between(rng, 6_000, 14_000), 'memcpy DtoH', 'copy')
    made++
    b.span(api, Math.max(at, cursor - 4_000), 9_000, 'cudaStreamSynchronize', 'sync')
    made++
    t = cursor + between(rng, 20_000, 70_000)
  }
  b.mark(t, 'step')
  return b.build({ source: 'synthetic', synthetic: true })
}
