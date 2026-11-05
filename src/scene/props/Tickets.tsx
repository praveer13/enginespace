import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Euler, InstancedBufferAttribute, Matrix4, Object3D, Quaternion, Vector3, type InstancedMesh, type Mesh } from 'three'
import { useKit } from '../kit'
import { roomFor, useProps } from './context'
import { feedSteps, progress, useMotionLoop } from './motion'
import { cellOffset, CLIP_DROP, feedPath, PRINTER_MOUTH, ticketGeometry } from './paper'
import { lathe, painted, type Vec3 } from './shape'
import { TICKET } from './specs'

/*
 * The paper on the pass (scene kit v1): tickets with thickness, curl and printed dots, the rail's sliding clips, and the printer's
 * feed. Each draws in one call however many it holds, and each moves only when its data changes: a ticket hung, slid along the rail
 * or spiked travels on the settle duration and curve; the printer feeds in line steps on the feed duration. Under reduced motion every
 * change is a cut. A ticket's number and words are DOM labels anchored by the scene (GAMES.md §2.6, rule 7).
 */

/** Where a ticket hangs from (the middle of its top edge), how it is turned, and which cell of the print atlas it carries. */
export interface TicketPose {
  readonly id: string
  readonly at: Vec3
  readonly rotation?: Vec3
  readonly cell: number
  /** A ticket new to the list comes from here, `delay` ms after the change (the printer's feed); without it, it is simply there. */
  readonly from?: { readonly at: Vec3; readonly rotation?: Vec3; readonly delay?: number }
  /** How high its moves arc over the straight line between their ends, in metres: a ticket carried to the spike. */
  readonly arc?: number
}

interface Pose {
  readonly position: Vector3
  readonly quaternion: Quaternion
}

interface Shown {
  target: Pose
  cell: number
  motion: { from: Pose; start: number; ms: number; delay: number; arc: number } | null
}

const euler = new Euler()
const poseOf = (at: Vec3, rotation: Vec3 = [0, 0, 0]): Pose => ({ position: new Vector3(...at), quaternion: new Quaternion().setFromEuler(euler.set(...rotation)) })
const matrix = new Matrix4()
const none = new Vector3(0, 0, 0)
/** Where a label frame waits while its ticket is not yet out of the printer: far below the floor, so its label hides. */
const away = new Vector3(0, -1000, 0)

/** Puts where a shown ticket is at `now` into `into`, given its move; false while its move still waits out its delay. */
function poseAt(shown: Shown, now: number, ease: (t: number) => number, into: { position: Vector3; quaternion: Quaternion }): boolean {
  const motion = shown.motion
  if (!motion) {
    into.position.copy(shown.target.position)
    into.quaternion.copy(shown.target.quaternion)
    return true
  }
  if (now < motion.start + motion.delay) return false
  const e = ease(progress(now, motion.start, motion.ms, motion.delay))
  into.position.lerpVectors(motion.from.position, shown.target.position, e)
  into.position.y += motion.arc * 4 * e * (1 - e)
  into.quaternion.slerpQuaternions(motion.from.quaternion, shown.target.quaternion, e)
  return true
}

/**
 * The tickets, one instanced draw, each `scale` times the kit's ticket. Each ticket also moves a label frame named `ticket:<id>`
 * (kit.registerFrame), at the same scale, so a DOM label anchored in it rides on the paper as it travels and turns.
 */
export function Tickets({ tickets, name = 'tickets', scale = 1 }: { tickets: readonly TicketPose[]; name?: string; scale?: number }) {
  const kit = useKit()
  const { materials } = useProps()
  const capacity = roomFor(tickets.length)
  const geometry = useMemo(() => {
    const sheet = ticketGeometry(TICKET.width, TICKET.height, TICKET.thickness)
    sheet.setAttribute('aCell', new InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
    return sheet
  }, [capacity])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<InstancedMesh>(null)
  const shown = useRef(new Map<string, Shown>())
  const order = useRef<string[]>([])
  const frames = useRef(new Map<string, { object: Object3D; release: () => void }>())
  const scratch = useMemo(() => ({ position: new Vector3(), quaternion: new Quaternion() }), [])
  const size = useMemo(() => new Vector3(scale, scale, scale), [scale])

  const ease = kit.ease
  const write = useCallback(
    (now: number): boolean => {
      const instanced = mesh.current
      if (!instanced) return false
      let moving = false
      order.current.forEach((id, i) => {
        const item = shown.current.get(id)
        if (!item) return
        const visible = poseAt(item, now, ease, scratch)
        instanced.setMatrixAt(i, matrix.compose(scratch.position, scratch.quaternion, visible ? size : none))
        const frame = frames.current.get(id)
        if (frame) frame.object.matrixWorld.compose(visible ? scratch.position : away, scratch.quaternion, size)
        if (item.motion) {
          if (progress(now, item.motion.start, item.motion.ms, item.motion.delay) >= 1) item.motion = null
          else moving = true
        }
      })
      instanced.instanceMatrix.needsUpdate = true
      return moving
    },
    [ease, scratch, size],
  )
  const wake = useMotionLoop(write)

  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const now = performance.now()
    const ms = kit.reducedMotion ? 0 : kit.tokens.motion.settleMs
    const next = new Map<string, Shown>()
    for (const ticket of tickets) {
      const target = poseOf(ticket.at, ticket.rotation)
      const was = shown.current.get(ticket.id)
      if (was) {
        const moved = was.target.position.distanceTo(target.position) > 1e-5 || was.target.quaternion.angleTo(target.quaternion) > 1e-4
        if (moved && ms > 0) {
          const from = { position: new Vector3(), quaternion: new Quaternion() }
          if (!poseAt(was, now, kit.ease, from)) poseAt({ ...was, motion: null, target: was.motion?.from ?? was.target }, now, kit.ease, from)
          next.set(ticket.id, { target, cell: ticket.cell, motion: { from, start: now, ms, delay: 0, arc: ticket.arc ?? 0 } })
        } else next.set(ticket.id, { target, cell: ticket.cell, motion: moved ? null : was.motion })
      } else if (ticket.from && ms > 0) {
        next.set(ticket.id, { target, cell: ticket.cell, motion: { from: poseOf(ticket.from.at, ticket.from.rotation), start: now, ms, delay: ticket.from.delay ?? 0, arc: ticket.arc ?? 0 } })
      } else next.set(ticket.id, { target, cell: ticket.cell, motion: null })
    }
    shown.current = next
    order.current = tickets.map((ticket) => ticket.id)
    // A label frame for each ticket on the list, and none for one that has gone.
    for (const [id, frame] of frames.current) {
      if (next.has(id)) continue
      frame.release()
      frames.current.delete(id)
    }
    for (const id of next.keys()) {
      if (frames.current.has(id)) continue
      const object = new Object3D()
      frames.current.set(id, { object, release: kit.registerFrame(`ticket:${id}`, object) })
    }
    const cells = geometry.getAttribute('aCell') as InstancedBufferAttribute
    order.current.forEach((id, i) => {
      const [u, v] = cellOffset(next.get(id)?.cell ?? 0)
      cells.setXY(i, u, v)
    })
    cells.needsUpdate = true
    instanced.count = tickets.length
    if (write(now)) wake()
    kit.invalidate()
  }, [tickets, geometry, kit, wake, write])

  useEffect(() => {
    const held = frames.current
    return () => {
      for (const frame of held.values()) frame.release()
      held.clear()
    }
  }, [])

  const cast = kit.shadowLights > 0
  return <instancedMesh ref={mesh} name={name} args={[geometry, materials.ticket, capacity]} castShadow={cast} receiveShadow={cast} frustumCulled={false} raycast={() => null} />
}

/** A clip on a rail: its id and where it sits along the rail, in metres from the rail's middle. */
export interface ClipPlace {
  readonly id: string
  readonly x: number
}

/**
 * The rail's clips: a chrome ball each, `scale` times the kit's, rolling along the slot to its place on the settle curve when the rail is
 * rearranged.
 */
export function RailClips({ at, clips, name = 'clips', scale = 1 }: { at: Vec3; clips: readonly ClipPlace[]; name?: string; scale?: number }) {
  const kit = useKit()
  const { materials, palette } = useProps()
  const capacity = roomFor(clips.length)
  const geometry = useMemo(() => {
    const ball: [number, number][] = []
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * Math.PI
      ball.push([Math.sin(t) * 0.0075, -Math.cos(t) * 0.0075])
    }
    return painted(palette.part(lathe(ball, 16), 'chrome'))
  }, [palette])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<InstancedMesh>(null)
  const state = useRef(new Map<string, { x: number; from: number; start: number }>())
  const order = useRef<string[]>([])
  const place = useMemo(() => new Vector3(), [])

  const { ease, reducedMotion } = kit
  const settleMs = kit.tokens.motion.settleMs
  const [ax, ay, az] = at
  const write = useCallback(
    (now: number): boolean => {
      const instanced = mesh.current
      if (!instanced) return false
      let moving = false
      order.current.forEach((id, i) => {
        const clip = state.current.get(id)
        if (!clip) return
        const t = reducedMotion ? 1 : progress(now, clip.start, settleMs)
        if (t < 1) moving = true
        place.set(ax + clip.from + (clip.x - clip.from) * ease(t), ay - CLIP_DROP, az + 0.003)
        instanced.setMatrixAt(i, matrix.makeScale(scale, scale, scale).setPosition(place))
      })
      instanced.instanceMatrix.needsUpdate = true
      return moving
    },
    [ease, reducedMotion, settleMs, ax, ay, az, place, scale],
  )
  const wake = useMotionLoop(write)

  useLayoutEffect(() => {
    const now = performance.now()
    const next = new Map<string, { x: number; from: number; start: number }>()
    for (const clip of clips) {
      const was = state.current.get(clip.id)
      if (was && was.x !== clip.x && !kit.reducedMotion) {
        const t = progress(now, was.start, kit.tokens.motion.settleMs)
        next.set(clip.id, { x: clip.x, from: was.from + (was.x - was.from) * kit.ease(t), start: now })
      } else next.set(clip.id, { x: clip.x, from: clip.x, start: was?.start ?? -Infinity })
    }
    state.current = next
    order.current = clips.map((clip) => clip.id)
    if (mesh.current) mesh.current.count = clips.length
    if (write(now)) wake()
    kit.invalidate()
  }, [clips, kit, wake, write])

  return <instancedMesh ref={mesh} name={name} args={[geometry, materials.metal, capacity]} castShadow={kit.shadowLights > 0} frustumCulled={false} raycast={() => null} />
}

/** The paper left hanging out of the mouth between tickets: the next ticket's head, curling over the front [estimated]. */
const REST = 0.07
const SAMPLES = 32

/**
 * The printer's feed: the paper out of its mouth, curling as it hangs. When `feed` grows, the printer prints one ticket's length in
 * line steps on the feed duration, and the ticket is torn at the bar (the scene hangs it on the rail, from `tearPose`); the paper
 * then rests at the bar again. `cell` is the print of the ticket being printed.
 */
export function PrinterFeed({ at, yaw = 0, feed, cell, name = 'printer-feed' }: { at: Vec3; yaw?: number; feed: number; cell: number; name?: string }) {
  const kit = useKit()
  const { materials } = useProps()
  const geometry = useMemo(() => {
    const strip = new BufferGeometry()
    const rows = SAMPLES + 1
    strip.setAttribute('position', new BufferAttribute(new Float32Array(rows * 2 * 3), 3))
    strip.setAttribute('normal', new BufferAttribute(new Float32Array(rows * 2 * 3), 3))
    strip.setAttribute('uv', new BufferAttribute(new Float32Array(rows * 2 * 2), 2))
    strip.setAttribute('aCell', new BufferAttribute(new Float32Array(rows * 2 * 2), 2))
    const index: number[] = []
    for (let k = 0; k < SAMPLES; k++) index.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3)
    strip.setIndex(index)
    return strip
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mesh = useRef<Mesh>(null)
  const run = useRef<{ feed: number; start: number }>({ feed, start: -Infinity })
  const placement = useMemo(() => new Matrix4().makeRotationY(yaw).setPosition(...at), [at, yaw])

  const shape = useCallback(
    (length: number) => {
    const points = feedPath(length, length / SAMPLES)
    const position = geometry.getAttribute('position') as BufferAttribute
    const uv = geometry.getAttribute('uv') as BufferAttribute
    const cells = geometry.getAttribute('aCell') as BufferAttribute
    const [cu, cv] = cellOffset(cell)
    const p = new Vector3()
    for (let k = 0; k <= SAMPLES; k++) {
      const [, y, z] = points[Math.min(k, points.length - 1)]
      const s = (Math.min(k, points.length - 1) / Math.max(1, points.length - 1)) * length
      for (let side = 0; side < 2; side++) {
        p.set((side === 0 ? -1 : 1) * (TICKET.width / 2), PRINTER_MOUTH[1] + y, PRINTER_MOUTH[2] + z).applyMatrix4(placement)
        position.setXYZ(k * 2 + side, p.x, p.y, p.z)
        uv.setXY(k * 2 + side, side, 1 - (length - s) / TICKET.height)
        cells.setXY(k * 2 + side, cu, cv)
      }
    }
    position.needsUpdate = true
    uv.needsUpdate = true
    cells.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    },
    [geometry, cell, placement],
  )

  const feedMs = kit.tokens.motion.feedMs
  const write = useCallback(
    (now: number): boolean => {
      const t = progress(now, run.current.start, feedMs)
      shape(t >= 1 ? REST : REST + TICKET.height * feedSteps(t))
      return t < 1
    },
    [feedMs, shape],
  )
  const wake = useMotionLoop(write)

  useLayoutEffect(() => {
    const now = performance.now()
    if (feed !== run.current.feed && !kit.reducedMotion && kit.tokens.motion.feedMs > 0) run.current = { feed, start: now }
    else run.current = { feed, start: -Infinity }
    if (write(now)) wake()
    kit.invalidate()
  }, [feed, kit, wake, write])

  return <mesh ref={mesh} name={name} geometry={geometry} material={materials.ticket} castShadow={kit.shadowLights > 0} frustumCulled={false} raycast={() => null} />
}
