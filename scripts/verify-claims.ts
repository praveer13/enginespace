/*
 * verify:claims (ARCHITECTURE §4.4, §4.7, §10.2; W0-T08). The claims registry, `content/claims/**.yaml`.
 *
 * It fails when:
 *   - a claim breaks its schema (packages/schema/claims.ts): a missing source, quote, date or tag, an unknown key, a source
 *     that is not an https URL, a derived claim without its formula;
 *   - two claims share an id;
 *   - a date lies in the future (a day's slack covers time zones);
 *   - a derived claim does not recompute from the inputs it declares, or declares one it does not read;
 *   - a claim's `pin` names a key that `course.lock.json` does not have, once that file exists (W1-T01).
 * It never fails on age. A claim past its TTL is listed as a warning with the day it went stale.
 *
 * A formula is arithmetic over its inputs' ids and numbers: + - * / and parentheses, and ceil, floor, round, min, max and abs.
 * The recomputed number must equal the claim's value to the precision the value is written in, and an integer must be exact.
 *
 *   bun scripts/verify-claims.ts [--root <dir>] [--today YYYY-MM-DD]
 *
 * Exit status: 0 when no error, 1 when one is found, 2 for a usage error.
 */
import { runGate } from './content/build.ts'
import type { ClaimRecord } from './content/build.ts'
import { problem } from './content/parse.ts'
import type { Diagnostic } from './content/parse.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Formulas                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export class FormulaError extends Error {}

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  ceil: (x) => Math.ceil(x),
  floor: (x) => Math.floor(x),
  round: (x) => Math.round(x),
  abs: (x) => Math.abs(x),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
}

type Token = { kind: 'number'; value: number } | { kind: 'input'; id: string } | { kind: 'name'; name: string } | { kind: 'symbol'; symbol: string }

/** Splits a formula into numbers, input ids, function names and symbols. An input id is matched as written, hyphens and dots included. */
function tokenize(formula: string, inputs: readonly string[]): Token[] {
  const byLength = [...inputs].sort((a, b) => b.length - a.length)
  const tokens: Token[] = []
  let at = 0
  while (at < formula.length) {
    const rest = formula.slice(at)
    const space = /^\s+/.exec(rest)
    if (space !== null) {
      at += space[0].length
      continue
    }
    const input = byLength.find((id) => rest.startsWith(id) && !/^[\w.-]/.test(rest.slice(id.length)))
    if (input !== undefined) {
      tokens.push({ kind: 'input', id: input })
      at += input.length
      continue
    }
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)
    if (number !== null) {
      tokens.push({ kind: 'number', value: Number(number[0]) })
      at += number[0].length
      continue
    }
    const name = /^[a-z]+(?=\()/.exec(rest)
    if (name !== null && name[0] in FUNCTIONS) {
      tokens.push({ kind: 'name', name: name[0] })
      at += name[0].length
      continue
    }
    if ('+-*/(),'.includes(rest[0])) {
      tokens.push({ kind: 'symbol', symbol: rest[0] })
      at += 1
      continue
    }
    const unreadable = /^[\w.]+(?:-[\w.]+)*/.exec(rest)?.[0] ?? rest[0]
    throw new FormulaError(`cannot read "${unreadable}" in the formula: it holds numbers, the declared inputs, + - * / ( ) , and ${Object.keys(FUNCTIONS).join(', ')}`)
  }
  return tokens
}

/**
 * Evaluates a formula over declared inputs. `used` collects the inputs it reads.
 * Throws a FormulaError on a syntax error, an input with no number, and a result that is not finite.
 */
export function evaluate(formula: string, inputs: ReadonlyMap<string, number>, used = new Set<string>()): number {
  const tokens = tokenize(formula, [...inputs.keys()])
  let at = 0
  const peek = () => tokens[at]
  const isSymbol = (symbol: string) => {
    const token = peek()
    return token?.kind === 'symbol' && token.symbol === symbol
  }
  const expect = (symbol: string) => {
    if (!isSymbol(symbol)) throw new FormulaError(`expected "${symbol}" in the formula`)
    at += 1
  }

  const expression = (): number => {
    let value = term()
    while (isSymbol('+') || isSymbol('-')) {
      const plus = isSymbol('+')
      at += 1
      const right = term()
      value = plus ? value + right : value - right
    }
    return value
  }
  const term = (): number => {
    let value = unary()
    while (isSymbol('*') || isSymbol('/')) {
      const times = isSymbol('*')
      at += 1
      const right = unary()
      if (!times && right === 0) throw new FormulaError('the formula divides by zero')
      value = times ? value * right : value / right
    }
    return value
  }
  const unary = (): number => {
    if (isSymbol('-')) {
      at += 1
      return -unary()
    }
    return primary()
  }
  const primary = (): number => {
    const token = peek()
    if (token === undefined) throw new FormulaError('the formula ends where a number was expected')
    at += 1
    if (token.kind === 'number') return token.value
    if (token.kind === 'input') {
      used.add(token.id)
      return inputs.get(token.id) as number
    }
    if (token.kind === 'name') {
      expect('(')
      const args = [expression()]
      while (isSymbol(',')) {
        at += 1
        args.push(expression())
      }
      expect(')')
      return FUNCTIONS[token.name](...args)
    }
    if (token.symbol === '(') {
      const value = expression()
      expect(')')
      return value
    }
    throw new FormulaError(`unexpected "${token.symbol}" in the formula`)
  }

  const value = expression()
  if (at < tokens.length) throw new FormulaError('the formula has something left over after its last term')
  if (!Number.isFinite(value)) throw new FormulaError('the formula does not give a finite number')
  return value
}

/** The digits after the point of a number as written: 3.9 has one, 2.5e-7 has seven, 24 has none. */
function decimalPlaces(value: number): number {
  const text = String(value)
  const exponent = /e-(\d+)$/.exec(text)
  const fraction = (text.split('e')[0].split('.')[1] ?? '').length
  return fraction + (exponent === null ? 0 : Number(exponent[1]))
}

/** Whether a claim's value is the computed number to the precision it is written in. An integer must be exact. */
export function agrees(value: number, computed: number): boolean {
  if (Number.isInteger(value)) return Math.abs(value - computed) <= 1e-9 * Math.max(1, Math.abs(value))
  return Math.abs(value - computed) <= 0.5 * Math.pow(10, -decimalPlaces(value)) * (1 + 1e-9)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const DAY = 86_400_000
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY
const dateOf = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10)

/** The checks that need every claim at once: dates, derived values, pins, and age. `today` is `YYYY-MM-DD`. */
export function claimProblems(records: readonly ClaimRecord[], lockKeys: ReadonlySet<string> | null, today: string): Diagnostic[] {
  const out: Diagnostic[] = []
  const byId = new Map(records.map((record) => [record.claim.id, record]))
  const error = (code: string, record: ClaimRecord, message: string) => out.push(problem('claims', 'error', code, record.file, record.line, `${record.claim.id}: ${message}`))
  const latest = dayNumber(today) + 1

  for (const record of records) {
    const { claim } = record
    const dates = [['verifiedAt', claim.verifiedAt], ...(claim.source === undefined ? [] : [['source.accessed', claim.source.accessed]])] as const
    for (const [name, date] of dates) {
      if (dayNumber(date) > latest) error('future-date', record, `${name} is ${date}, which is after today (${today})`)
    }

    if (claim.pin !== undefined && lockKeys !== null && !lockKeys.has(claim.pin)) {
      error('unknown-pin', record, `pin "${claim.pin}" is not a key of course.lock.json`)
    }

    if (claim.derived !== undefined) {
      const values = new Map<string, number>()
      for (const id of claim.derived.inputs) {
        const input = byId.get(id)?.claim
        if (input === undefined) error('unknown-input', record, `derived from "${id}", which is not a claim`)
        else if (typeof input.value !== 'number') error('unknown-input', record, `derived from "${id}", whose value is not a number`)
        else values.set(id, input.value)
      }
      if (typeof claim.value !== 'number') {
        error('not-derived', record, 'a derived claim\'s value is a number')
        continue
      }
      if (values.size < claim.derived.inputs.length) continue
      try {
        const used = new Set<string>()
        const computed = evaluate(claim.derived.formula, values, used)
        for (const id of claim.derived.inputs.filter((input) => !used.has(input))) error('unused-input', record, `declares the input "${id}", and the formula does not read it`)
        if (!agrees(claim.value, computed)) error('not-derived', record, `the value is ${claim.value}, and ${claim.derived.formula} gives ${computed}`)
      } catch (caught) {
        if (!(caught instanceof FormulaError)) throw caught
        error('bad-formula', record, caught.message)
      }
    }

    const stale = dayNumber(claim.verifiedAt) + claim.ttlDays
    if (stale < dayNumber(today)) {
      out.push(problem('claims', 'warning', 'stale-claim', record.file, record.line, `${claim.id}: stale since ${dateOf(stale)} (checked ${claim.verifiedAt}, good for ${claim.ttlDays} days)`))
    }
  }

  const pinned = records.find((record) => record.claim.pin !== undefined)
  if (lockKeys === null && pinned !== undefined) {
    out.push(problem('claims', 'warning', 'pins-unchecked', pinned.file, pinned.line, 'pins are not checked: course.lock.json does not exist yet (W1-T01 creates it)'))
  }
  return out
}

export function main(argv: readonly string[], now: Date = new Date()): number {
  const rest: string[] = []
  let today = now.toISOString().slice(0, 10)
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--today' && /^\d{4}-\d{2}-\d{2}$/.test(argv[i + 1] ?? '')) {
      today = argv[i + 1]
      i += 1
    } else rest.push(argv[i])
  }
  return runGate('claims', rest, (result) => claimProblems(result.claims, result.lockKeys, today))
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
