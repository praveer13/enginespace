/*
 * The error rates of the rejection-sampler lab's chi-square at the model's level, for as many cases as you like (W1-T27). Not a test: bun test
 * collects only *.test.ts, and this runs for minutes at the sizes below. It drives W1-T26's reference and bestiary through the oracle's own case
 * and seeds (`exactCase`, `exactSeeds` of packages/sim/forge/rejection-sampler.ts), the same two seeds of 20,000 rounds at α = 1e-4 that the
 * `exact` check sends, so its rates are the check's, without the worker and the wasm. tests/forge/rejection-sampler-rates.test.ts measures the
 * same through the real host, on the builds that Rust makes, and is slower by a factor of about twenty.
 *
 *   N=50000 FIRST=1000000 MEMBERS=reference bun tests/sim/rejection-sampler-rates.ts
 *   N=20000 FIRST=1000 MEMBERS=resample-from-p,fly-lossy bun tests/sim/rejection-sampler-rates.ts
 *
 *   N         cases to try, default 500
 *   FIRST     the number of the first case. Case n is the seed (n × 2,654,435,761) mod 2^32, so that cases far apart in n are not neighbours in seed
 *   MEMBERS   a comma-separated list of `reference` and bestiary ids, default all seven
 *
 * It prints, for each member, how many cases the check rejected (either of its two seeds over the limit), and the quantiles of the first
 * seed's statistic as a multiple of its limit: a member whose smallest multiple is well over 1 is caught with room to spare.
 */
import { BESTIARY, REFERENCE, chiSquare, criticalValue, firstTokenCounts } from '../../packages/sim/spec'
import { exactCase, exactSeeds } from '../../packages/sim/forge'

const cases = Number(process.env['N'] ?? 500)
const first = Number(process.env['FIRST'] ?? 1)
const ids = (process.env['MEMBERS'] ?? ['reference', ...BESTIARY.map((member) => member.id)].join(',')).split(',')

for (const id of ids) {
  const member = id === 'reference' ? REFERENCE : BESTIARY.find((m) => m.id === id)
  if (member === undefined) throw new Error(`no member "${id}": the members are reference, ${BESTIARY.map((m) => m.id).join(', ')}`)
  const started = performance.now()
  const ratios: number[] = []
  let rejected = 0
  for (let n = 0; n < cases; n++) {
    const seed = (((first + n) * 2_654_435_761) % 4_294_967_296) >>> 0
    const { p, q } = exactCase(seed)
    let over = false
    exactSeeds(seed).forEach((test, k) => {
      const { stat, df } = chiSquare(firstTokenCounts(test.test, p, q, member.verify), p[0])
      const ratio = stat / criticalValue('1e-4', df)
      if (k === 0) ratios.push(ratio)
      if (ratio > 1) over = true
    })
    if (over) rejected += 1
  }
  ratios.sort((a, b) => a - b)
  const at = (share: number) => ratios[Math.min(ratios.length - 1, Math.floor(share * ratios.length))].toFixed(2)
  const seconds = Math.round((performance.now() - started) / 1000)
  console.log(
    `${id.padEnd(22)} rejected ${rejected}/${cases}  first seed, statistic over limit: min ${ratios[0].toFixed(2)}  p1 ${at(0.01)}  p5 ${at(0.05)}  median ${at(0.5)}  max ${ratios[ratios.length - 1].toFixed(2)}  (${seconds} s)`,
  )
}
