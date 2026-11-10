/*
 * W2-T07: receipt.worker, and the client that talks to it (src/receipts/verify-in-worker.ts).
 *
 *   - The real worker runs in Bun, from its source file, as Vite bundles it for the browser: `new Worker(new URL(…, import.meta.url))`. A file goes
 *     in as a Blob, and the outcome comes back as plain data, the same as `verifyBundle` gives on the main thread. Bun's worker is not Chromium's, and
 *     the browser is held in e2e/receipts-import.spec.ts; what this shows is that the worker file is a worker, with the messages of protocol.ts.
 *   - The client stops the worker when it has answered, when it crashes and when it takes too long, and says so in a sentence. A fake port
 *     stands in for the worker in those, so a test can make it never answer.
 */
import { describe, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { MAX_DECOMPRESSED_BYTES, verifyBundle } from '@es/verify'
import type { Outcome } from '@es/verify'
import type { ReceiptReply, ReceiptRequest } from '@/receipts/protocol'
import { verifierOn, verifyInWorker } from '@/receipts/verify-in-worker'
import type { ReceiptPort } from '@/receipts/verify-in-worker'
import { changed, contextFor, fileOf, sampleBundle } from '../verify/support'

describe('the real worker', () => {
  test('checks a receipt on its own thread and answers with what the main thread would: the same six rules, the same identity', async () => {
    const bundle = sampleBundle()
    const file = fileOf(bundle)
    const here = await verifyBundle(file, contextFor(bundle))
    const there = await verifyInWorker(file, contextFor(bundle))
    expect(there).toEqual(here)
    expect(there.kind).toBe('checked')
    if (there.kind === 'checked') {
      expect(there.rules.map((rule) => rule.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass'])
      expect(there.receipt).toEqual(bundle.receipt)
    }
  }, 30_000)

  test('refuses a tampered hash with the artifact named, and a zip bomb with the cap in the message, on its own thread', async () => {
    const tampered = changed((b) => {
      const entry = b.receipt.artifacts.find((artifact) => artifact.id === 'log')
      if (entry !== undefined) entry.sha256 = '0'.repeat(64)
    })
    const one = await verifyInWorker(fileOf(tampered), contextFor(tampered))
    expect(one.kind).toBe('refused')
    expect(one.rules[2].problems[0]).toContain('Artifact "log"')
    const bomb = new Blob([new Uint8Array(gzipSync(Buffer.alloc(MAX_DECOMPRESSED_BYTES + 4 * 1024 * 1024)))])
    const two = await verifyInWorker(bomb, contextFor())
    expect(two.kind).toBe('refused')
    expect(two.rules[0].summary).toContain('268,435,456 bytes that the site reads once decompressed')
  }, 30_000)

  test('is made for each check, so one file leaves nothing behind for the next: two checks in a row answer alike', async () => {
    const bundle = sampleBundle()
    const first = await verifyInWorker(fileOf(bundle), contextFor(bundle))
    const second = await verifyInWorker(fileOf(bundle), contextFor(bundle))
    expect(second).toEqual(first)
  }, 30_000)
})

/** A port that records what it is asked, and answers as the test tells it to. */
function fakePort(behaviour: (request: ReceiptRequest, reply: (reply: ReceiptReply) => void) => void, ready = true) {
  const log: string[] = []
  let onReply: (reply: ReceiptReply) => void = () => {}
  let onCrash: (message: string) => void = () => {}
  const port: ReceiptPort = {
    post: (request) => {
      log.push(`post ${request.type} ${request.id}`)
      behaviour(request, (reply) => onReply(reply))
    },
    listen: (reply, crash) => {
      log.push('listen')
      onReply = reply
      onCrash = crash
      if (ready) queueMicrotask(() => onReply({ type: 'ready' }))
    },
    stop: () => log.push('stop'),
  }
  return { port, log, crash: (message: string) => onCrash(message), say: (reply: ReceiptReply) => onReply(reply) }
}

const REFUSED: Outcome = { kind: 'refused', rules: [] }
const file = new Blob(['x'])

describe('the client', () => {
  test('waits for the worker to say it is ready, sends the file once, and stops the worker when it has the answer', async () => {
    const fake = fakePort((request, reply) => reply({ type: 'verified', id: request.id, outcome: REFUSED }))
    const outcome = await verifierOn(() => fake.port)(file, contextFor())
    expect(outcome).toEqual(REFUSED)
    expect(fake.log).toEqual(['listen', 'post verify 1', 'stop'])
  })

  test('rejects with the worker\'s own message when the check itself breaks, and stops the worker', async () => {
    const fake = fakePort((request, reply) => reply({ type: 'failed', id: request.id, message: 'this page cannot hash a file' }))
    await expect(verifierOn(() => fake.port)(file, contextFor())).rejects.toThrow('this page cannot hash a file')
    expect(fake.log.at(-1)).toBe('stop')
  })

  test('rejects, with a sentence, when the worker crashes, and stops it', async () => {
    const fake = fakePort(() => {})
    const pending = verifierOn(() => fake.port)(file, contextFor())
    await Promise.resolve()
    fake.crash('out of memory')
    await expect(pending).rejects.toThrow('The worker that checks a receipt stopped: out of memory')
    expect(fake.log.at(-1)).toBe('stop')
  })

  test('gives up after its time, and stops a worker that never answers; a late answer changes nothing', async () => {
    const fake = fakePort(() => {})
    const pending = verifierOn(() => fake.port, 20)(file, contextFor())
    await expect(pending).rejects.toThrow('The check took longer than 0.02 seconds, so it was stopped. Nothing was kept.')
    expect(fake.log.at(-1)).toBe('stop')
    fake.say({ type: 'verified', id: 1, outcome: REFUSED })
    expect(fake.log.filter((line) => line === 'stop')).toHaveLength(1)
  })

  test('says so when the worker cannot be started', async () => {
    const check = verifierOn(() => {
      throw new Error('Worker is not defined')
    })
    await expect(check(file, contextFor())).rejects.toThrow('This browser could not start the worker that checks a receipt: Worker is not defined')
  })

  test('ignores a reply for another request', async () => {
    const fake = fakePort((request, reply) => {
      reply({ type: 'verified', id: request.id + 1, outcome: REFUSED })
      reply({ type: 'verified', id: request.id, outcome: { kind: 'refused', rules: [] } })
    })
    expect(await verifierOn(() => fake.port)(file, contextFor())).toEqual(REFUSED)
  })
})
