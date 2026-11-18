import { useMemo } from 'react'
import { latencyUs } from '@es/play/broken-bench/desk'
import { layoutHistogram } from '@es/play/broken-bench/layout'
import type { BenchView } from '@es/play/broken-bench/types'
import { formatReadout } from '@/design/format'
import type { DockViewProps } from '@/games/kit/RunContext'
import { Plot } from './Plot'

/*
 * Broken benchmark's compact view, for a lesson's dock (REDESIGN §2.5, §2.6): the run beside the prose, drawn flat. It is the same run as the
 * instrument's (RunContext.tsx), so it draws the same view: the report's claim, the histogram of its log at the clock the report used, and
 * how many reports are filed. The switch, the cut and the form stay in the instrument, where the lesson's "Back to my run" leads, and the
 * dock offers no Step: no move of this game is one a guess leaves untouched.
 */

export function DockView({ run }: DockViewProps<BenchView>) {
  const { view } = run
  const scene = view.scene
  const sheet = useMemo(() => {
    if (scene === null) return null
    const clock = scene.claim.timerStartsAt === 'send' ? 'sent' : 'due'
    return layoutHistogram({
      orientation: 'portrait',
      latencies: scene.rows.map((row) => latencyUs(row, clock)),
      cut: scene.harnessCut,
      selected: null,
      claimUs: scene.claim.valueUs,
      p99Us: null,
    })
  }, [scene])
  if (scene === null || sheet === null) {
    return (
      <div className="es-bench-dockview" data-bench-dock="" data-done="">
        <p>Every report is filed. The result is in the instrument.</p>
      </div>
    )
  }
  return (
    <div className="es-bench-dockview" data-bench-dock="">
      <p className="es-bench-dockview__claim">
        Reported p99 <span className="font-numeric">{formatReadout(scene.claim.valueUs / 1000, 1)}</span> ms, from <span className="font-numeric">{formatReadout(scene.claim.n)}</span> requests, timed from{' '}
        {scene.claim.timerStartsAt === 'send' ? 'the send time' : 'the due time'}.
      </p>
      <Plot sheet={sheet} />
      <p className="es-bench-dockview__count">
        {view.cases === 1 ? 'One report' : `Report ${view.caseNo} of ${view.cases}`}, <span className="font-numeric">{view.filed}</span> filed.
      </p>
    </div>
  )
}
