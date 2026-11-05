/*
 * A `hybrid-kv` module written in TypeScript: the wire of packages/sim/forge/kv-wire.ts spoken by any `KvModel`. The real modules are
 * Rust compiled to wasm (labs/forge/hybrid-kv, tests/fixtures/forge/hybrid-kv); this one stands in for them where a test needs a
 * module that is right (the reference) or wrong in one chosen way (the TypeScript bestiary of tests/sim/kv-bestiary.ts), without a
 * Rust toolchain, and where it needs to break the wire itself. It is the inverse of the plan's parsing, so a mistake in either shows
 * as a plan that fails a right module.
 */
import type { CheckPlan, KvModel, KvSpec } from '../../packages/sim'
import { isProblem, parseWireOp, parseWireSpec, wireEvents, wireReply, wireState } from '../../packages/sim'

export type KvMaker = (spec: KvSpec) => KvModel

/** A module as a function from a command to its reply. It throws where a module would trap. */
export function kvModule(make: KvMaker): (command: string) => string {
  let model: KvModel | null = null
  /** Batches of events handed out so far. */
  let delivered = 0
  return (command) => {
    const verb = command.split(' ')[0]
    if (verb === 'init') {
      const spec = parseWireSpec(command)
      if (isProblem(spec)) return `err ${spec.problem}`
      model = make(spec.value)
      delivered = 0
      return 'ok'
    }
    if (model === null) return 'err not initialized'
    switch (verb) {
      case 'admit':
      case 'append':
      case 'finish':
      case 'load':
      case 'unload':
      case 'reset':
        return wireReply(model.apply(parseWireOp(command)))
      case 'events': {
        const batches = model.events().slice(delivered)
        delivered += batches.length
        return wireEvents(batches.flatMap(([, events]) => events))
      }
      case 'pages':
      case 'queue':
      case 'requests':
      case 'adapters':
      case 'cache':
        return wireState(model.state())[verb]
      default:
        return `err unknown command '${command}'`
    }
  }
}

export interface Driven {
  ok: boolean
  message: string
  commands: number
  batches: number
  /** The module threw: where a real one would trap. */
  threw?: boolean
}

/** Plays a plan against a module the way the runner does: a batch at a time, to the first wrong reply. */
export function drive(plan: CheckPlan, module: (command: string) => string): Driven {
  let commands = 0
  let batches = 0
  try {
    for (let batch = plan.next(); batch !== null; batch = plan.next()) {
      batches += 1
      commands += batch.length
      const wrong = plan.judge(batch.map((command) => module(command)))
      if (wrong !== null) return { ok: false, message: wrong, commands, batches }
    }
  } catch (e) {
    return { ok: false, message: `the module threw: ${e instanceof Error ? e.message : String(e)}`, commands, batches, threw: true }
  }
  return { ok: true, message: plan.passed(), commands, batches }
}
