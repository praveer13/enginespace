import { useMemo } from 'react'
import { BlockGrid } from './BlockGrid'
import { CameraRig } from './CameraRig'
import { Fixtures } from './Fixtures'
import { HeatLamps, Fluorescent } from './Lights'
import type { LabelSpec } from './labels'
import { spanBox } from './marks'
import { SceneCanvas } from './SceneCanvas'
import { SelectionMarker } from './SelectionMarker'
import { SheetInstances } from './SheetInstances'
import { SpanInstances } from './SpanInstances'
import { SPECIMEN_PRESETS, type SpecimenLayout } from './specimen-layout'
import { TimeTicks, TimeTrack } from './TimeAxis'

/*
 * The specimen's 3D scene: the kit's primitives on one pass, in The Pass's materials. A lazy chunk of its own, loaded by
 * the Stage on /design. It draws the layout and decides nothing: every mark comes from specimen-layout.ts.
 *
 * Draw calls: the steel (1), the lamps' bulbs (1), the tickets (1), the tape (1), the legend tray (1), the slabs (1), the
 * places (1), the ticks (1) and the selection (1): nine, whatever the load.
 */

export interface SpecimenScene3DProps {
  layout: SpecimenLayout
  preset: string
  orbit: boolean
  /** The selected fire's id. */
  selected: string | null
  onPick: (fireId: string) => void
}

/** The night recedes from 2 to 22 units beyond what the camera looks at [estimated]. */
const FOG = { near: 2, far: 22 }

/** How far a fire's places stand above its slab (specimen-layout.ts's place height). */
const PLACES_RISE = 0.04

/** Any mark of a fire (its slab, a place, its dark stretch, its CPU phases) selects the fire. */
function fireOf(id: string): string | null {
  const match = /^(?:fire-|dark-|cpu-)(\d+)/.exec(id)
  return match ? `fire-${match[1]}` : null
}

export default function SpecimenScene3D({ layout, preset, orbit, selected, onPick }: SpecimenScene3DProps) {
  const labels = useMemo<LabelSpec[]>(
    () =>
      layout.anchors.map((anchor) => ({
        id: anchor.id,
        at: anchor.at,
        frame: anchor.frame,
        place: anchor.place,
        className: `es-kit-label es-kit-label--${anchor.kind}`,
        content: anchor.text,
        minWidth: anchor.minWidth,
      })),
    [layout.anchors],
  )
  // The frame stands around the fire's slab and its places on top.
  const selectedBox = useMemo(() => {
    const span = layout.spans.find((mark) => mark.id === selected)
    if (!span) return null
    const box = spanBox(span, { unitsPerTime: layout.unitsPerTime })
    return { ...box, center: [box.center[0], box.center[1] + PLACES_RISE / 2, box.center[2]] as const, size: [box.size[0], box.size[1] + PLACES_RISE, box.size[2]] as const }
  }, [layout.spans, layout.unitsPerTime, selected])
  const pick = (id: string) => {
    const fire = fireOf(id)
    if (fire) onPick(fire)
  }
  const axisX = layout.lanes.gpuX + layout.lanes.gpuWidth / 2 + 0.14

  return (
    <SceneCanvas labels={labels} fog={FOG} exposure={1} environmentIntensity={0.8}>
      <CameraRig presets={SPECIMEN_PRESETS} preset={preset} orbit={orbit} />
      <Fluorescent />
      <HeatLamps lamps={layout.lamps} />
      <Fixtures parts={layout.fixtures} />
      <SheetInstances kind="paper" sheets={layout.tickets} curl={0.12} name="tickets" />
      <SheetInstances kind="tape" sheets={layout.tapes} name="tape" />
      <BlockGrid cells={layout.legend} name="legend" />
      <TimeTrack now={layout.window.now} unitsPerTime={layout.unitsPerTime}>
        <SpanInstances spans={layout.spans} onPick={pick} />
        <BlockGrid cells={layout.cells} onPick={pick} name="places" />
        <TimeTicks window={layout.window} x={axisX} maxTicks={layout.settings.clips === 4 ? 7 : 8} />
        <SelectionMarker box={selectedBox} />
      </TimeTrack>
    </SceneCanvas>
  )
}
