/**
 * One game's blind-strategy check, in a process of its own (scripts/games/blind.ts, `measureAside`): it loads the game's session, holds each
 * of its graded levels to the bound, and prints the result as JSON on its standard output.
 *
 *   bun scripts/games/blind-run.ts <game id>
 */
import { GAMES } from '../../packages/play'
import { BLIND_PROBES, checkBlind } from './blind.ts'

const entry = GAMES.get(process.argv[2] ?? '')
if (entry === undefined) {
  console.error(`blind-run: no game "${process.argv[2] ?? ''}" is registered`)
  process.exitCode = 2
} else {
  console.log(JSON.stringify(checkBlind(entry, await entry.session(), BLIND_PROBES[entry.id])))
}
