import { useMemo, useState } from 'react'
import { drawInBand } from '@es/play'
import { compile, composeRun, type ComposeRow } from '@es/play/loop/full/compose'
import { buildFullLevel } from '@es/play/loop/full/levels'
import { fullSession } from '@es/play/loop/full/session'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { Ticket } from '@/design/components/Ticket'
import { tagOf } from './tags'
import type { FullRun } from './types'

/*
 * Compose (GAMES.md §3, "Compose and In production"; kernelspace's play sequence): the levers you served each stage with, as one policy,
 * compiled to the pinned engines' configuration, and run on tonight's seed and on three fresh ones beside the house. A fresh seed is drawn
 * when you ask, from the browser's generator, through the level's band. The policy is the levers, not a rule, so a mode or a set of
 * molds chosen for one night may not hold on the next: that is the point of running it there.
 */

/** Fresh seeds for a run of the policy [estimated: three, kernelspace's Compose takes five minutes]. */
const FRESH = 3

export function Compose({ run }: { run: FullRun }) {
  const { view } = run
  const level = useMemo(() => buildFullLevel(view.level, run.seed), [view.level, run.seed])
  const policy = view.stages.map((stage) => stage.levers)
  const compiled = useMemo(() => compile(level.stages, policy), [level, policy])
  const [rows, setRows] = useState<ComposeRow[] | null>(null)
  const serve = () => {
    const seeds = [run.seed]
    const entropy = crypto.getRandomValues(new Uint32Array(FRESH))
    for (const value of entropy) seeds.push(drawInBand(fullSession, view.level, value))
    setRows(composeRun(view.level, policy, seeds))
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6" data-full-compose="">
      <Ticket as="section" width="full" hole={false} head="Compose" meta={view.title} titleAs="h3" title="Your policy, as the engines read it">
        <p>The levers you served each stage with, compiled to the configuration of the pinned engines. A line the engines have no flag for is said in words.</p>
        <figure className="es-full-config">
          <figcaption>vLLM v0.33.0</figcaption>
          <pre>
            <code>{['vllm serve <model>', ...compiled.vllm].join(' \\\n  ')}</code>
          </pre>
        </figure>
        {compiled.sglang.length > 0 ? (
          <figure className="es-full-config">
            <figcaption>SGLang v0.5.23</figcaption>
            <pre>
              <code>{['python -m sglang.launch_server --model-path <model>', ...compiled.sglang].join(' \\\n  ')}</code>
            </pre>
          </figure>
        ) : null}
        {compiled.notes.length > 0 ? (
          <ul className="es-full-notes">
            {compiled.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ink" onClick={serve}>
            Run my policy on tonight and on three fresh nights
          </Button>
        </div>
        <div role="status" aria-live="polite">
          {rows === null ? null : (
            <div role="region" aria-label="The policy on each night" tabIndex={0} className="overflow-x-auto" data-compose-result="">
              <table className="w-full border-collapse text-left">
                <caption className="pb-2 text-left font-bold">Your policy, stage by stage, against the house on each night</caption>
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-edge py-2 pr-4 font-bold">
                      Night
                    </th>
                    {level.stages.map((stage) => (
                      <th key={stage.id} scope="col" className="border-b border-edge py-2 pr-4 text-right font-bold">
                        {stage.title}
                        <span className="block text-sm font-normal text-text-2">µs, yours against the house</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={`${row.seed}-${i}`} className="border-b border-paper-rule">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {i === 0 ? 'Tonight' : `Fresh night ${i}`}
                        <span className="block text-sm text-text-2">{row.ok ? 'every stage at the bar' : 'a stage misses the bar'}</span>
                      </th>
                      {row.stages.map((stage, s) => (
                        <td key={stage.id} className="py-2 pr-4 text-right">
                          {stage.metric === null ? (
                            <span className="text-paper-ink-2">the engine refuses it</span>
                          ) : (
                            <>
                              <Readout value={stage.metric} unit="µs" tag={tagOf({ synthetic: level.stages[s].card === 'small' }, 'expo')} size="sm" tone={stage.ok ? 'ink' : 'ink-2'} />
                              <span className="block text-sm text-text-2">
                                against <Readout value={stage.house} unit="µs" tag={tagOf({ synthetic: level.stages[s].card === 'small' }, 'expo')} size="sm" />
                              </span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Ticket>
    </div>
  )
}
