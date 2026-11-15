/**
 * The equivalence proof of R-T02 (docs/waves/wr-tasks.json): moving display text out of a game's state moves no rule, so the hash of
 * the old state with exactly the moved paths removed must equal the hash of the new state, at every state of every reference run.
 *
 *   bun scripts/state-copy-equivalence.ts record > before.json   on the tree before the move
 *   bun scripts/state-copy-equivalence.ts check before.json      on the tree after it: exits 1 on any difference
 *
 * `record` writes, for every built game's level on its practice seed, the hash of each state along the reference run as it stands
 * (`raw`) and with the moved paths removed (`stripped`), and the hashes that the golden tables hold (the start, and the end of the
 * session's own reference). `check` recomputes the same, requires each new `raw` to equal the old `stripped`, requires no moved path
 * to remain, and prints each golden's old and new value.
 */
import { readFileSync } from 'node:fs'
import { GAMES, stateHash } from '../packages/play'
import { referenceWalks } from '../tests/play/state-copy-support'

type Json = unknown

/** The paths that held display text in a state. `*` is every element of an array. */
export const MOVED: readonly (readonly string[])[] = [
  ['level', 'title'],
  ['level', 'prompt'],
  ['level', 'predict', 'ask'],
  ['level', 'predict', 'unit'],
  ['level', 'stages', '*', 'title'],
  ['level', 'stages', '*', 'prompt'],
  ['level', 'stages', '*', 'prediction', 'question'],
  ['level', 'stages', '*', 'prediction', 'unit'],
  ['level', 'stages', '*', 'prediction', 'options'],
]

/** A copy of `value` without the moved paths. */
export function strip(value: Json, paths: readonly (readonly string[])[] = MOVED): Json {
  const walk = (v: Json, rest: readonly (readonly string[])[]): Json => {
    if (rest.length === 0 || typeof v !== 'object' || v === null) return v
    if (Array.isArray(v)) return v.map((item) => walk(item, rest.filter((p) => p[0] === '*').map((p) => p.slice(1))))
    const out: Record<string, Json> = {}
    for (const [key, item] of Object.entries(v)) {
      const here = rest.filter((p) => p[0] === key)
      if (here.some((p) => p.length === 1)) continue
      out[key] = walk(item, here.map((p) => p.slice(1)))
    }
    return out
  }
  return walk(value, paths)
}

interface Row {
  readonly where: string
  readonly raw: string[]
  readonly stripped: string[]
}

interface Golden {
  readonly where: string
  readonly start: string
  readonly end: string
}

interface Record_ {
  readonly rows: Row[]
  readonly goldens: Golden[]
}

async function measure(): Promise<Record_> {
  const rows = referenceWalks().map((walk): Row => ({
    where: `${walk.game}/${walk.level}@${walk.seed}`,
    raw: walk.states.map((state) => stateHash(state)),
    stripped: walk.states.map((state) => stateHash(strip(state))),
  }))
  const goldens: Golden[] = []
  for (const game of GAMES.games) {
    const session = await game.session()
    for (const level of game.levels) {
      const built = session.level(level.id, level.practiceSeed)
      goldens.push({ where: `${game.id}/${level.id}@${level.practiceSeed}`, start: stateHash(session.init(built)), end: stateHash(session.ghost(built)) })
    }
  }
  return { rows, goldens }
}

async function main(): Promise<void> {
  const [mode, file] = process.argv.slice(2)
  const now = await measure()
  if (mode === 'record') {
    console.log(JSON.stringify(now))
    return
  }
  if (mode !== 'check' || file === undefined) throw new Error('usage: state-copy-equivalence.ts record | check <before.json>')
  const before = JSON.parse(readFileSync(file, 'utf8')) as Record_
  let problems = 0
  const say = (message: string) => {
    problems += 1
    console.log(`DIFFERENT  ${message}`)
  }
  let states = 0
  for (const row of before.rows) {
    const after = now.rows.find((r) => r.where === row.where)
    if (after === undefined) {
      say(`${row.where}: the level is gone`)
      continue
    }
    if (after.raw.length !== row.stripped.length) say(`${row.where}: ${row.stripped.length} states before, ${after.raw.length} after`)
    after.raw.forEach((hash, i) => {
      states += 1
      if (hash !== row.stripped[i]) say(`${row.where} state ${i}: new ${hash}, old with the moved paths removed ${row.stripped[i]}`)
      if (hash !== after.stripped[i]) say(`${row.where} state ${i}: a moved path is still in the state`)
    })
  }
  console.log(`${before.rows.length} reference runs, ${states} states: the new hash equals the old state's with the moved paths removed${problems === 0 ? ', every one' : ''}.`)
  console.log('\ngame/level@seed            start old -> new           end old -> new')
  for (const old of before.goldens) {
    const after = now.goldens.find((g) => g.where === old.where)
    if (after === undefined) {
      say(`${old.where}: the level is gone`)
      continue
    }
    console.log(`${old.where.padEnd(28)} ${old.start} -> ${after.start}   ${old.end} -> ${after.end}`)
  }
  if (problems > 0) process.exit(1)
}

if (import.meta.main) await main()
