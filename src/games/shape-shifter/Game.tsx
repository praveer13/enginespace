import { levelOf } from '@es/play'
import { copyOf } from '@es/play/shape-shifter/copy'
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'
import { shiftSession } from '@es/play/shape-shifter/session'
import { ROSTER } from '@es/play/roster'
import { Frame } from '@/games/kit/Frame'
import type { GameProps } from '@/games/registry'

const ROLE = ROSTER.find((entry) => entry.id === SHAPE_SHIFTER.id)?.role ?? ''

/* Skeleton: the frame around an empty diagram, to measure the route. */
export default function Game({ level, mode = 'practice', placement = 'page', rev, onFinish }: GameProps) {
  const entry = levelOf(SHAPE_SHIFTER, level ?? '') ?? SHAPE_SHIFTER.levels[0]
  return (
    <Frame
      game={SHAPE_SHIFTER}
      role={ROLE}
      session={shiftSession}
      level={entry.id}
      levelTitle={entry.title}
      seed={entry.practiceSeed}
      mode={mode}
      rev={rev}
      embedded={placement === 'embed'}
      onFinish={onFinish}
      goal={(run) => {
        const goal = copyOf(shiftSession.level(run.level, run.seed)).goal
        return { aim: goal.aim, control: goal.controls, target: goal.beat, ends: goal.ends }
      }}
      diagram={() => <div data-shift-diagram="" />}
      legend={() => null}
      dock={() => null}
      readout={() => null}
      result={() => null}
      mirror={() => null}
      parts={[]}
      howTo={null}
      titleBlock={{ model: 'Model of a tensor', clock: 'Clock: operations', leavesOut: null }}
    />
  )
}
