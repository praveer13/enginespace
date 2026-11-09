import type { FloorView } from '@es/play/engine-floor/types'
import { plain } from './text'

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/**
 * The line the live region says for a change of the view (A§6.9: one sentence per turn). It is a summary for the ear: the mirror carries
 * every fact the drawing shows. Empty when nothing a listener needs to know changed.
 */
export function changeLine(before: FloorView, after: FloorView): string {
  if (before.level !== after.level) return ''
  if (before.prediction === null && after.prediction !== null) return `Prediction written down: ${plural(after.prediction, 'process boundary', 'process boundaries')}. The tray is open.`
  if (after.runs > before.runs) {
    const stop = after.stop
    // A level that allows one run is over when it has had it, home or not.
    const over = after.done && !after.served ? ' The level is over.' : ''
    if (stop !== null) return `The ticket stopped at stage ${stop.at + 1}, after ${plural(after.reached, 'stage that held', 'stages that held')}. ${plain(stop.sentence)}${over}`
    if (after.done) return after.served ? 'The ticket is home: every hand-off held, and the request is back where it began.' : `Every stage held, and the path ends before the request is back where it began.${over}`
    return `${plural(after.reached, 'stage held', 'stages held')}. The ticket stands at ${plain(after.capsule.process)} · ${plain(after.capsule.thread)}.`
  }
  if (after.laid.length > before.laid.length) {
    const stage = after.laid[after.laid.length - 1]
    return `Laid stage ${stage.index + 1}: ${plain(stage.label)}.`
  }
  if (after.laid.length < before.laid.length) return `The path is back to ${plural(after.laid.length, 'stage', 'stages')}.`
  const moved = after.laid.findIndex((stage, i) => stage.id !== before.laid[i]?.id)
  if (moved >= 0) return `Stage ${moved + 1} is now ${plain(after.laid[moved].label)}.`
  return ''
}
