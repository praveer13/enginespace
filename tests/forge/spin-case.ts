/*
 * A scenario in which a module never returns, run in a process of its own: `bun tests/forge/spin-case.ts <case>` prints one line of JSON
 * and exits. Under bun, `Worker.terminate()` cannot interrupt a wasm infinite loop, so a worker that was stopped at its limit keeps its
 * thread spinning until the process ends (measured: a whole core, for as long as the process lives). Inside `bun test` that would burn a
 * core for the rest of the suite and slow every test that runs after it, so the tests that need a real spin (worker.test.ts and
 * toy-wasm.test.ts) run it here, and `process.exit` ends the thread. verify:labs does the same for its own run. A browser terminates
 * the worker for good, which e2e/forge.spec.ts shows.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHost } from '../../src/forge/host'
import { runLab } from '../../src/forge/invoke'
import { FORGE_LABS } from '../../src/forge/labs'
import { browserPool } from '../../src/forge/worker-pool'
import { readBestiary } from '../../scripts/labs/bestiary'
import { judge } from '../../scripts/labs/judge'
import { buildLabModule, toBuffer } from './wasm'

const root = path.resolve(import.meta.dirname, '../..')
const host = createHost({ pool: browserPool() })

async function workerSpin() {
  await host.load(toBuffer(buildLabModule({ invoke: 'spin' })))
  const first = await host.open()
  const started = performance.now()
  const outcome = await first.call(['x'], 300)
  const ms = performance.now() - started
  // A new worker has taken the same bytes, and a spin there is stopped too: it was not the old, dead worker that answered.
  const second = await host.open()
  return { first: { kind: outcome.kind, ms }, second: { kind: (await second.call(['y'], 300)).kind } }
}

async function toySpin() {
  const lab = FORGE_LABS.toy
  const file = readFileSync(path.join(root, 'tests/fixtures/forge/toy/spin.wasm'))
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
  const member = readBestiary(path.join(root, 'labs/forge/toy')).members.find((m) => m.id === 'spin')
  if (member === undefined) throw new Error('the bestiary has no spin member')
  const module = await host.load(bytes)
  const times: Record<string, number> = {}
  const run = await runLab(host, lab, module, {
    only: member.only,
    onProgress: (event) => {
      if (event.type === 'check-start') times[event.id] = performance.now()
      else times[event.result.id] = performance.now() - times[event.result.id]
    },
  })
  const verdict = await judge(host, lab, 'bestiary', bytes, { runs: 1, member })
  return { statuses: run.checks.map((check) => `${check.id} ${check.status}`), msg: run.checks[1]?.msg, times, problems: verdict.problems }
}

const cases: Record<string, () => Promise<unknown>> = { 'worker-spin': workerSpin, 'toy-spin': toySpin }
const name = process.argv[2] ?? ''
const scenario = cases[name]
if (scenario === undefined) {
  console.error(`no case "${name}": the cases are ${Object.keys(cases).join(', ')}`)
  process.exit(2)
}
console.log(JSON.stringify(await scenario()))
host.dispose()
process.exit(0)
