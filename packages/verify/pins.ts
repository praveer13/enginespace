/**
 * Rule 6, pins (ARCHITECTURE §8.5, D-035): the engine must be the one `course.lock.json` pins. An off-pin run is shown and labelled, and earns
 * no credit unless the lab declares the version compatible.
 *
 * The receipt carries a `pins` block that the grader wrote (`onPin`, `offPin`), and the site does not take it as given (packages/schema's
 * receipt.ts says so): it compares what the environment reports with its own copy of the lock. What it can compare today is the engine, by its
 * name against the lock's keys, its version against the pinned release and its commit against the pinned commit. What it cannot is the
 * libraries (flashinfer, xgrammar, triton, transformers, torch): the lock pins the engines and the reading targets and not them, and the
 * environments' own locks, which do pin them, are W2-T04's and are not on the site yet. For those the grader's own comparison with its
 * environment's lock is the evidence, and the receipt's `offPin` names what it found off. A grader that says it found something off the pins
 * fails this rule: it is the run's own admission.
 *
 * A lab that runs an engine must name it. Leaving the engine out is the way round this rule, and it is closed here: only the labs that run
 * no engine, TR0's forward pass on the laptop's CPU, may have none.
 */
import type { Receipt } from '@es/schema/receipt'
import { cut } from './format'
import type { RuleResult } from './report'

/** An engine the course pins: the lock's key for it, and what the lock pins it by. nano-vllm has no releases and is pinned by commit alone. */
export interface EnginePin {
  readonly name: string
  readonly version?: string
  readonly commit?: string
}

export type PinTable = readonly EnginePin[]

/** The labs that run no engine (lane L, ARCHITECTURE §8.1): a receipt of one of them has no engine to compare. */
export const ENGINELESS_LABS: readonly string[] = ['tr0.forward']

/** Engine versions that a lab declares compatible, by lab and then by engine (ARCHITECTURE §8.5 rule 6). No lab declares one yet. */
export type Compatible = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>

export interface PinOptions {
  readonly compatible?: Compatible
}

/** A version without its local label: `0.33.0+cu130` is release `0.33.0` (PEP 440: what follows a `+` is not part of the release). */
const release = (version: string): string => version.split('+', 1)[0]

const short = (commit: string): string => commit.slice(0, 12)

const outcome = (status: 'pass' | 'fail', summary: string, problems: readonly string[] = []): RuleResult => ({ rule: 6, id: 'pins', status, summary, problems })

export function checkPins(receipt: Receipt, table: PinTable, options: PinOptions = {}): RuleResult {
  const { engine } = receipt.environment
  const { pins } = receipt
  const problems: string[] = []
  const notes: string[] = []

  if (!pins.onPin) {
    problems.push(`The grader reports the run off the pins: ${pins.offPin.map((name) => cut(name)).join(', ')}. It compared the installed packages with the environment's lock, and the report is its own admission.`)
  }

  if (engine === undefined) {
    if (ENGINELESS_LABS.includes(receipt.lab)) notes.push('The lab runs no engine.')
    else problems.push(`${receipt.lab} runs an engine, and the receipt names none, so its pin cannot be checked.`)
  } else {
    const pinned = table.find((entry) => entry.name === engine.name)
    const declared = options.compatible?.[receipt.lab]?.[engine.name]?.includes(release(engine.version)) === true
    if (pinned === undefined) {
      const known = table.map((entry) => entry.name).join(', ')
      problems.push(`The engine "${cut(engine.name)}" is not one the course pins${known === '' ? '' : ` (it pins ${known})`}.`)
    } else {
      const shown = `${engine.name} ${cut(engine.version, 40)}`
      if (pinned.version !== undefined && release(engine.version) !== pinned.version) {
        if (declared) notes.push(`${shown} is not the pinned ${pinned.version}, and ${receipt.lab} declares it compatible.`)
        else problems.push(`${shown} is off the pin: the course pins ${engine.name} ${pinned.version}.`)
      }
      if (pinned.commit !== undefined) {
        if (engine.commit === undefined) {
          if (pinned.version === undefined) problems.push(`The course pins ${engine.name} by commit ${short(pinned.commit)}, and the receipt names no commit.`)
        } else if (engine.commit !== pinned.commit && !declared) {
          problems.push(`${shown} is at commit ${short(engine.commit)}, and the course pins ${engine.name} at commit ${short(pinned.commit)}.`)
        }
      }
      if (problems.length === 0 && notes.length === 0) notes.push(`${shown} is the pin.`)
    }
  }

  if (problems.length > 0) return outcome('fail', 'The run is off the course\'s pins.', problems)
  const libs = receipt.environment.libs.length
  notes.push(libs === 0 ? 'The libraries are the grader\'s own comparison, and it listed none.' : `The ${libs} listed libraries are the grader's own comparison with its environment's lock.`)
  return outcome('pass', notes.join(' '))
}
