import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import type { ColorRoleName } from '@/design/tokens'
import { useKit } from './kit'
import { MarkInstances } from './MarkInstances'
import type { MarkBox } from './marks'
import { axisTicks, scrollMs, trackOffset, trackZ, type TimeWindow } from './time-axis'
import { TrackContext, useTrack, type Track } from './track'

/*
 * TimeAxis (ARCHITECTURE §6.4): the track time runs along, and its ticks.
 *
 * TimeTrack is a group whose children are placed on the model's clock (time-axis.ts). Its offset keeps `now` at the near
 * end, so when the clock advances the whole history slides back by the step: over the bell's duration on the settle curve,
 * or in one jump under reduced motion. While it slides, the present sweeps forward and the marks inside are cut off at it.
 * It registers itself as the label frame `track`, so tick labels and ticket numbers ride along.
 *
 * TimeTicks draws the axis's tick marks at round steps along one edge of a lane. Their numbers are DOM labels the scene
 * builds from the same `axisTicks`, in the numeral face.
 */

export interface TimeTrackProps {
  /** The present, on the model's clock. */
  now: number
  /** Scene units per unit of time. */
  unitsPerTime: number
  /** The label frame this track registers as. Default `track`. */
  frame?: string
  children: ReactNode
}

export function TimeTrack({ now, unitsPerTime, frame = 'track', children }: TimeTrackProps) {
  const kit = useKit()
  const group = useRef<Group>(null)
  const motion = useRef({ from: now, to: now, current: now, startedAt: 0, ms: 0, moving: false, release: null as (() => void) | null })

  const track = useMemo<Track>(
    () => ({
      unitsPerTime,
      moving: () => motion.current.moving,
      presentZ: () => (motion.current.moving ? trackZ(motion.current.current, { unitsPerTime }) : Number.POSITIVE_INFINITY),
      sweepFromZ: () => trackZ(motion.current.from, { unitsPerTime }),
    }),
    [unitsPerTime],
  )

  useEffect(() => {
    if (!group.current) return
    return kit.registerFrame(frame, group.current)
  }, [kit, frame])

  // A new clock: slide to it, or jump under reduced motion.
  useLayoutEffect(() => {
    const m = motion.current
    const ms = scrollMs(kit.tokens.motion.bellMs, kit.reducedMotion)
    if (ms === 0 || now <= m.current) {
      m.release?.()
      motion.current = { from: now, to: now, current: now, startedAt: 0, ms: 0, moving: false, release: null }
      if (group.current) group.current.position.z = trackOffset(now, { unitsPerTime })
      kit.invalidate()
      return
    }
    const release = m.release ?? kit.hold()
    motion.current = { from: m.current, to: now, current: m.current, startedAt: performance.now(), ms, moving: true, release }
  }, [now, unitsPerTime, kit])

  useEffect(() => {
    const held = motion
    return () => held.current.release?.()
  }, [])

  useFrame(() => {
    const m = motion.current
    if (!m.moving || !group.current) return
    const t = Math.min(1, (performance.now() - m.startedAt) / m.ms)
    m.current = m.from + (m.to - m.from) * kit.ease(t)
    if (t >= 1) {
      m.current = m.to
      m.moving = false
      m.release?.()
      m.release = null
    }
    group.current.position.z = trackOffset(m.current, { unitsPerTime })
  }, -2)

  return (
    <group ref={group} position-z={trackOffset(now, { unitsPerTime })}>
      <TrackContext.Provider value={track}>{children}</TrackContext.Provider>
    </group>
  )
}

export interface TimeTicksProps {
  window: TimeWindow
  /** The lane edge the ticks stand on: x, and the height of their base. */
  x: number
  y?: number
  /** About how many ticks the window shows. */
  maxTicks?: number
  role?: ColorRoleName
}

/** Tick marks at round steps of the clock, inside a TimeTrack. */
export function TimeTicks({ window, x, y = 0, maxTicks = 8, role = 'edge' }: TimeTicksProps) {
  const track = useTrack()
  const unitsPerTime = track?.unitsPerTime ?? 1
  const key = axisTicks(window, maxTicks).join(',')
  const boxes = useMemo<MarkBox[]>(
    () =>
      key === ''
        ? []
        : key.split(',').map((value) => {
            const t = Number(value)
            return { id: `tick-${t}`, center: [x, y + 0.004, trackZ(t, { unitsPerTime })], size: [0.16, 0.008, 0.012], role, form: 'solid' }
          }),
    [key, x, y, role, unitsPerTime],
  )
  return <MarkInstances boxes={boxes} name="ticks" />
}
