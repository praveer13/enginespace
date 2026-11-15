/**
 * The blind-strategy bound of `verify:games` (ASSESSMENT §4.1 and §13, ARCHITECTURE §10.2; W1b-T12): on every graded level of a game, the
 * best scene-blind strategy passes a single banded seed at most `BLIND_BOUND` of the time [estimated], so that three fresh seeds in a row
 * are out of reach by guessing. The strategies are the probes of `packages/play/<game>/blind.ts`, which play them through the game's own
 * session and grade them with its own grade. This file holds the probes of the five games, and the check that holds a game to the bound.
 *
 * The nights that the probes play take a minute or so in all, and the games' are independent of one another, so the command line measures
 * each game in a process of its own (`measureAside`, which runs ./blind-run.ts) while the other checks go on. The tests measure in this
 * process, with a session that they have made easy, or a probe that says what it is told (`measuredBy`).
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AnySession, GameEntry } from '../../packages/play'
import { BLIND_BOUND } from '../../packages/play/blind'
import type { BlindProbes } from '../../packages/play/blind'
import { BROKEN_BENCH_BLIND } from '../../packages/play/broken-bench/blind'
import { ENGINE_FLOOR_BLIND } from '../../packages/play/engine-floor/blind'
import { LOOP_BLIND } from '../../packages/play/loop/blind'
import { POOL_BLIND } from '../../packages/play/pool/blind'
import { VERIFIER_BLIND } from '../../packages/play/verifier/blind'

/**
 * The probes of every game's graded levels, by game id (ASSESSMENT §4.1). A game that gets a graded level adds its probe in its own
 * folder and its game's entry here, and the gate fails a graded level with none.
 */
export const BLIND_PROBES: Readonly<Record<string, BlindProbes>> = {
  loop: LOOP_BLIND,
  verifier: VERIFIER_BLIND,
  'engine-floor': ENGINE_FLOOR_BLIND,
  'broken-bench': BROKEN_BENCH_BLIND,
  pool: POOL_BLIND,
}

/** The fewest seeds, or cases, that a strategy's rate may be read on [estimated]: under it the rate says nothing, and a band too tight to find them is the finding. */
export const MIN_BLIND_SAMPLE = 30

const percent = (share: number): string => `${(100 * share).toFixed(1)}%`

export interface BlindCheck {
  problems: string[]
  /** One line per graded level, for the printout. */
  lines: string[]
}

/** What the gate asks for each game: its graded levels measured against the bound. */
export type BlindMeasure = (entry: GameEntry, session: AnySession) => BlindCheck | Promise<BlindCheck>

/**
 * Holds every graded level of a game to ASSESSMENT §4.1's bound: the best scene-blind strategy of a level's probe passes a single banded
 * seed at most `BLIND_BOUND` of the time [estimated]. A graded level with no probe fails, and so does a probe for a level that is not a
 * graded level of the game. Never throws: whatever a probe throws is a finding.
 */
export function checkBlind(entry: GameEntry, session: AnySession, probes: BlindProbes | undefined): BlindCheck {
  const problems: string[] = []
  const lines: string[] = []
  const graded = (entry.levels ?? []).filter((level) => level.graded)
  for (const id of Object.keys(probes ?? {})) {
    if (!graded.some((level) => level.id === id)) problems.push(`level ${id}: it has a blind-strategy probe and is not a graded level of the game: drop the probe, or grade the level`)
  }
  for (const { id } of graded) {
    const probe = probes?.[id]
    if (probe === undefined) {
      problems.push(`level ${id}: it is graded and has no blind-strategy probe (ASSESSMENT §4.1): add one to packages/play/${entry.id}/blind.ts, and to BLIND_PROBES in scripts/games/blind.ts`)
      continue
    }
    try {
      const rows = probe(session)
      if (rows.length === 0) {
        problems.push(`level ${id}: its blind-strategy probe tried no strategy`)
        continue
      }
      const unread = rows.find((row) => !(row.of >= MIN_BLIND_SAMPLE) || !(row.rate >= 0 && row.rate <= 1))
      if (unread !== undefined) {
        problems.push(
          `level ${id}: the blind-strategy probe read ${unread.strategy} on ${unread.of} seeds at rate ${unread.rate}: it needs at least ${MIN_BLIND_SAMPLE} seeds that the band accepts, and a rate from 0 to 1`,
        )
        continue
      }
      const best = rows.reduce((top, row) => (row.rate > top.rate ? row : top))
      lines.push(`${id}: best blind strategy passes ${percent(best.rate)} of ${best.of} banded seeds, against the bound of ${percent(BLIND_BOUND)} [estimated] (${rows.length} tried): ${best.describe}`)
      if (best.rate > BLIND_BOUND) {
        problems.push(
          `level ${id}: the best scene-blind strategy passes ${percent(best.rate)} of ${best.of} banded seeds, over ASSESSMENT §4.1's bound of ${percent(BLIND_BOUND)} [estimated]: ${best.describe}. The level can be passed without reading the scene`,
        )
      }
    } catch (error) {
      problems.push(`level ${id}: its blind-strategy probe threw: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { problems, lines }
}

/** The measure over a table of probes, in this process: what the tests give a gate to run against a session that they have made easy. */
export const measuredBy =
  (table: Readonly<Record<string, BlindProbes>>): BlindMeasure =>
  (entry, session) =>
    checkBlind(entry, session, table[entry.id])

/**
 * A game's blind check in a process of its own, started now and read when it ends. The games' nights are independent, so the command line
 * starts all of them first and the games' other checks go on beside them. A process that does not end well is a finding for each graded
 * level of its game, and not a pass: the gate fails closed.
 */
export function measureAside(entry: GameEntry): Promise<BlindCheck> {
  const lost = (why: string): BlindCheck => ({
    problems: entry.levels.filter((level) => level.graded).map((level) => `level ${level.id}: the blind-strategy bound was not measured: ${why}`),
    lines: [],
  })
  return new Promise((resolve) => {
    const runner = path.join(path.dirname(fileURLToPath(import.meta.url)), 'blind-run.ts')
    const child = spawn(process.execPath, [runner, entry.id], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')))
    child.on('error', (error) => resolve(lost(`the process for ${entry.id} did not start (${error.message})`)))
    child.on('close', (code) => {
      try {
        // The result is the last line of the output, so a module that prints a line of its own on the way does not lose it.
        const parsed = JSON.parse(out.trim().split('\n').pop() ?? '') as BlindCheck
        if (Array.isArray(parsed.problems) && Array.isArray(parsed.lines)) return resolve(parsed)
      } catch {
        // Not a result: the process failed, and says why on its error output.
      }
      resolve(lost(`the process for ${entry.id} ended with status ${String(code)} and no result. ${err.trim().split('\n').slice(-3).join(' | ')}`.trim()))
    })
  })
}
