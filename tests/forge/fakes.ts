/*
 * Stand-ins for the parts of the forge host that run elsewhere: a worker that answers from a script (or never answers), a pool that
 * hands them out and remembers which it was asked to stop, and a clock that only moves when the test moves it. They let the host's
 * logic be tested to the millisecond, with nothing spinning. The real worker is tested in tests/forge/worker.test.ts.
 */

import type { ForgePool, ForgePort, Timers } from '../../src/forge/host'
import type { ForgeReply, ForgeRequest } from '../../src/forge/protocol'
import type { ListReply } from '../../vendor/kernelspace/src/lib/forge/types'

export class FakeClock implements Timers {
  now = 0
  private next = 0
  private timers = new Map<number, { at: number; fn: () => void }>()

  set(fn: () => void, ms: number): unknown {
    const id = this.next++
    this.timers.set(id, { at: this.now + ms, fn })
    return id
  }

  clear(handle: unknown): void {
    this.timers.delete(handle as number)
  }

  /** Moves the clock forward and fires what comes due, in order. */
  advance(ms: number): void {
    const until = this.now + ms
    for (;;) {
      const due = [...this.timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (due === undefined) break
      this.timers.delete(due[0])
      this.now = Math.max(this.now, due[1].at)
      due[1].fn()
    }
    this.now = until
  }

  get pending(): number {
    return this.timers.size
  }
}

export type Handler = (request: ForgeRequest, port: FakePort) => ForgeReply | 'hang' | 'crash' | undefined

/** A worker that answers each request as its handler says: with a reply, not at all (`hang`), or by dying (`crash`). */
export class FakePort implements ForgePort {
  readonly requests: ForgeRequest[] = []
  private listener: ((reply: ForgeReply) => void) | null = null
  private crash: ((message: string) => void) | null = null
  readonly name: string
  private handler: Handler
  constructor(name: string, handler: Handler) {
    this.name = name
    this.handler = handler
  }

  post(request: ForgeRequest): void {
    this.requests.push(request)
    const answer = this.handler(request, this)
    queueMicrotask(() => {
      if (answer === 'hang' || answer === undefined) return
      if (answer === 'crash') this.crash?.('the worker died')
      else this.listener?.(answer)
    })
  }

  subscribe(onMessage: (reply: ForgeReply) => void, onCrash: (message: string) => void): () => void {
    this.listener = onMessage
    this.crash = onCrash
    return () => {
      this.listener = null
      this.crash = null
    }
  }

  get types(): string[] {
    return this.requests.map((request) => request.type)
  }
}

export class FakePool implements ForgePool {
  readonly ports: FakePort[] = []
  readonly discarded: FakePort[] = []
  private handler: Handler
  constructor(handler: Handler) {
    this.handler = handler
  }

  async acquire(): Promise<ForgePort> {
    const port = new FakePort(`worker ${this.ports.length + 1}`, this.handler)
    this.ports.push(port)
    return port
  }

  discard(port: ForgePort): void {
    this.discarded.push(port as FakePort)
  }
}

/** A list reply as a lab module gives it. */
export const listOf = (lab: string, checks: { id: string; label: string; stage: number; seeded: boolean }[], version = 1): ListReply => ({ lab, version, abi: 2, checks })

/** Answers load, open and close the way a healthy worker does, and calls by the function given. */
export function healthy(list: ListReply, call: (ops: readonly string[], id: number) => ForgeReply | 'hang' | 'crash'): Handler {
  return (request) => {
    switch (request.type) {
      case 'load':
        return { type: 'loaded', id: request.id, list }
      case 'open':
        return { type: 'opened', id: request.id }
      case 'call':
        return call(request.ops, request.id)
      case 'close':
        return { type: 'closed', id: request.id }
    }
  }
}
