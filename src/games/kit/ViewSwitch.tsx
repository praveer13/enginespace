import { useId } from 'react'
import { Button } from '@/design/components/Button'

/*
 * The 2D and 3D switch (ARCHITECTURE §6.8, §6.9): two native buttons in a labelled group, the current one pressed. `V` does the
 * same from the keyboard, and both stay mounted while the view underneath swaps, so a change of view keeps focus on the same
 * logical control (WCAG 2.4.3). The session lives above the views, so the levers carry over (A§6.7).
 *
 * When 3D is not on offer (no WebGL, the learner chose 2D in Settings, a tier that cannot) the 3D button is disabled and says
 * why in words beside it. The 2D view is never a lesser path (A§6.2).
 */

export type GameView = '2d' | '3d'

export interface ViewSwitchProps {
  view: GameView
  onViewChange: (view: GameView) => void
  /** Whether the 3D view can be shown right now. */
  available3d: boolean
  /** Why it cannot, in a few words: "3D is off in Settings". */
  unavailableReason?: string
}

export function ViewSwitch({ view, onViewChange, available3d, unavailableReason }: ViewSwitchProps) {
  const reasonId = useId()
  const reason = available3d ? undefined : unavailableReason
  return (
    <div role="group" aria-label="View" className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={view === '2d' ? 'ink' : 'plate'} aria-pressed={view === '2d'} aria-keyshortcuts="V" onClick={() => onViewChange('2d')}>
        2D view
      </Button>
      <Button
        size="sm"
        variant={view === '3d' ? 'ink' : 'plate'}
        aria-pressed={view === '3d'}
        aria-keyshortcuts="V"
        disabled={!available3d}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => onViewChange('3d')}
      >
        3D view
      </Button>
      {reason ? (
        <span id={reasonId} className="text-text-2">
          {reason}
        </span>
      ) : null}
    </div>
  )
}
