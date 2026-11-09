import { useMemo } from 'react'
import { useSceneTokens } from '@/design/scene-tokens'
import type { CameraPreset } from './camera-rig'
import { CameraRig } from './CameraRig'
import { CAMERAS, cellOf, clipX, kitchenLayout, serviceAt, stationsLit, focusOf, type KitchenLayout, type ServiceState, type Subject } from './kitchen-specimen'
import type { LabelSpec } from './labels'
import { Fluorescent } from './Lights'
import { CHANNEL, CLIP_DROP, Kitchen, LampLights, litMask, Plates, PrinterFeed, RailClips, ServiceBell, StaticSet, Steam, tearPose, Tickets, type PlatePlace, type TicketPose } from './props'
import { SceneCanvas } from './SceneCanvas'
import { SheetInstances } from './SheetInstances'
import type { Vec3 } from './props/specs'

/*
 * The kitchen specimen's 3D scene (scene kit v1, on /design): one piece of the line's equipment alone on the bench, or the whole pass
 * assembled, drawn only from src/scene/props and laid out by kitchen-specimen.ts. A lazy chunk of its own, loaded by the Stage that
 * the specimen holds; it draws the layout and decides nothing.
 *
 * The bell is the step: each ring runs one fire of the specimen's small service (serviceAt), and everything that moves moves on it.
 * Between bells the kitchen is still and draws nothing.
 *
 * Draw calls, assembled, at T1: the static set's metal, glaze, tile, floor and glow (5), the contact shadows (1), the tickets (1), the
 * clips (1), the printer's paper (1), the plates (1) and the bell's dome and plunger (2): 12. T2 adds the lamps' cones (1), the steam
 * (1), and each shadow-casting lamp's pass over what casts. The hotel pans' tape, on the pans alone, is one more.
 */

export interface KitchenScene3DProps {
  subject: Subject
  /** Bells rung: each is one fire of the specimen's service. */
  step: number
}

/** The haze the room falls into, from this far beyond what the camera looks at to this far [estimated]: the back wall softens. */
const HAZE = { near: 0.6, far: 7.5 }

/** A ticket's lean on its clip: from its number, never a random draw, so a rail never looks stamped out. */
const lean = (no: number) => (((no * 37) % 11) / 11 - 0.5) * 0.06

const isStation = (subject: Subject) => subject === 'griddle' || subject === 'burners' || subject === 'fryer'

/** The tickets this subject shows: on the rail's clips, carried to the spike when done, and fresh from the printer when hung. */
function ticketPoses(subject: Subject, layout: KitchenLayout, service: ServiceState, feedMs: number): TicketPose[] {
  const poses: TicketPose[] = []
  const { rail, spike, printer } = layout
  if (rail) {
    const [rx, ry, rz] = rail.at
    for (const ticket of service.rail) {
      const x = rx + (subject === 'assembled' ? clipX(ticket.clip) : (1.5 - ticket.clip) * 0.3)
      const fresh = service.printed.includes(ticket.no)
      const from = fresh
        ? printer
          ? { ...tearPose(printer.at, printer.yaw), delay: feedMs }
          : { at: [rx - rail.length / 2 - 0.05, ry - 0.03, rz + 0.05] as Vec3, rotation: [-0.2, 0, 0.1] as Vec3 }
        : undefined
      poses.push({ id: `t${ticket.no}`, at: [x, ry - CLIP_DROP - 0.004, rz + 0.012], rotation: [-0.05, 0, lean(ticket.no)], cell: cellOf(ticket.no), from, arc: 0.04 })
    }
  }
  if (spike && (rail || subject === 'spike')) {
    const spiked = subject === 'spike' ? service.spiked.slice(-4) : service.spiked
    spiked.forEach((no, k) => {
      poses.push({
        id: `t${no}`,
        at: [spike[0], spike[1] + 0.026 + k * 0.0022, spike[2]],
        rotation: [-Math.PI / 2, 0, ((no * 53) % 17) / 17 - 0.5],
        cell: cellOf(no),
        from: subject === 'spike' ? { at: [spike[0] + 0.06, spike[1] + 0.22, spike[2] + 0.04], rotation: [-1.2, 0, 0.3] } : undefined,
        arc: 0.14,
      })
    })
  }
  if (printer && subject === 'printer') {
    // The printer alone: what it tore lies on the bench in front of it, the latest on top.
    service.spiked.slice(-3).forEach((no, k) => {
      poses.push({
        id: `t${no}`,
        at: [printer.at[0] + 0.02 - k * 0.012, printer.at[1] + 0.001 + k * 0.0012, printer.at[2] + 0.17],
        rotation: [-Math.PI / 2, 0, 0.25 - k * 0.2],
        cell: cellOf(no),
        from: { ...tearPose(printer.at, printer.yaw), delay: feedMs },
      })
    })
  }
  return poses
}

/** The fire's plates: one under each ticket on the rail, sliding in from the line's side; the last fire's are carried out to the expo. */
function platePlaces(layout: KitchenLayout, service: ServiceState): PlatePlace[] {
  const plates = layout.plates
  if (!plates) return []
  return service.plates.map((plate) => {
    const x = plates.x(plate.clip)
    const [lx, ly, lz] = plates.leave
    return { id: plate.id, at: [x, plates.y, plates.z], enter: [x, plates.y, plates.enterZ], leave: [x + lx, plates.y + ly, plates.z + lz] }
  })
}

export default function KitchenScene3D({ subject, step }: KitchenScene3DProps) {
  const tokens = useSceneTokens()
  const layout = useMemo(() => kitchenLayout(subject), [subject])
  const service = useMemo(() => serviceAt(step), [step])
  const camera = CAMERAS[subject]
  const presets = useMemo<CameraPreset[]>(
    () => [{ id: subject, label: 'Look', shot: subject === 'assembled' ? 'establish' : 'focus', projection: 'perspective', position: camera.position, target: camera.target, fov: camera.fov, portrait: camera.portrait }],
    [subject, camera],
  )

  // Which stations burn: the service's, on the assembled line; a station alone burns on even bells and stands dark on odd ones.
  const lit = useMemo(() => (subject === 'assembled' ? stationsLit(service) : isStation(subject) ? [step % 2 === 0] : []), [subject, service, step])
  const lampOn = subject !== 'lamp' || step % 2 === 0
  const mask = litMask(lit) & (lampOn ? -1 : ~(1 << CHANNEL.lamp))
  const lights = lampOn ? layout.lights : []
  const steam = useMemo(() => layout.stations.filter((station) => lit[station.channel]).map((station) => station.top), [layout.stations, lit])

  const feedMs = tokens.motion.feedMs
  const tickets = useMemo(() => ticketPoses(subject, layout, service, feedMs), [subject, layout, service, feedMs])
  const plates = useMemo(() => platePlaces(layout, service), [layout, service])
  const clips = useMemo(() => {
    if (!layout.rail) return []
    return service.balls.map((clip, b) => ({ id: `ball-${b}`, x: subject === 'assembled' ? clipX(clip) : (1.5 - clip) * 0.3 }))
  }, [layout.rail, service.balls, subject])
  const printing = service.lastPrinted
  const tapes = useMemo(() => layout.tapes.map((tape) => ({ id: tape.id, center: tape.center, size: tape.size, rotation: tape.rotation })), [layout.tapes])

  const labels = useMemo<LabelSpec[]>(() => {
    const out: LabelSpec[] = []
    for (const ticket of service.rail) {
      if (!layout.rail) break
      out.push({ id: `no-${ticket.no}`, at: [0, -0.024, 0.002], frame: `ticket:t${ticket.no}`, place: 'center', className: 'es-kitchen-label es-kitchen-label--ticket', content: `#${ticket.no}`, minWidth: 420 })
    }
    for (const tape of layout.tapes) out.push({ id: `tape-${tape.id}`, at: tape.center, place: 'center', className: 'es-kitchen-label es-kitchen-label--tape', content: tape.text })
    return out
  }, [service.rail, layout.rail, layout.tapes])

  const focus = focusOf(subject)
  return (
    <SceneCanvas labels={labels} fog={{ near: HAZE.near + focus * 0.15, far: HAZE.far + focus * 0.5 }} exposure={1} environmentIntensity={0.75} shadows className="es-kitchen-scene">
      <CameraRig presets={presets} preset={subject} parallax={0.05} />
      <Fluorescent power={0.85} />
      <Kitchen lit={mask}>
        <StaticSet items={layout.items} name={`set-${subject}`} />
        <LampLights lamps={lights} power={subject === 'pass' ? 0.3 : 1} />
        {layout.rail ? <RailClips at={layout.rail.at} clips={clips} /> : null}
        <Tickets tickets={tickets} />
        {layout.printer ? <PrinterFeed at={layout.printer.at} yaw={layout.printer.yaw} feed={subject === 'printer' ? step : service.lastPrinted} cell={cellOf(printing)} /> : null}
        {layout.bell ? <ServiceBell at={layout.bell} strike={step} /> : null}
        {layout.plates ? <Plates plates={plates} /> : null}
        <Steam emitters={steam} puff={step} />
      </Kitchen>
      {tapes.length > 0 ? <SheetInstances kind="tape" sheets={tapes} name="tape" /> : null}
    </SceneCanvas>
  )
}
