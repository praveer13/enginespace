/*
 * Service's 3D layout (ARCHITECTURE §6.3, §6.4; GAMES.md §3 "3D scene", §2.6 "Service"): the view of the night turned into the
 * positioned primitives the scene kit draws. It is a pure function of `LoopView`, the same view the 2D view, the poster and the mirror
 * draw, so the scene adds nothing the session did not compute and decides nothing. It holds no three (the bundle keeps three behind
 * the scene's lazy chunk) and is tested under Bun.
 *
 * The world, from the expo's side outward (+z is toward the camera, the night runs down -z):
 *
 *   - The pass: a stainless counter across the middle, under three heat lamps. The present sits on it, just under the rail, so the
 *     newest fire and its plates lie under the lamps, and at every bell the night slides back down the pass and off into the line.
 *   - The rail: a stainless bar above the pass with one clip per slot, every taken clip with its ticket. Each clip hangs right in front
 *     of its own row of places, so a ticket's courses line up along the night behind it.
 *   - The fired rail: with overlap on, a second, lower rail behind the first that holds the fire on the line while the expo writes the
 *     next call on the rail (GAMES.md §2.6). It is there only while a fire is on the line.
 *   - The printer, at the rail's left end, and the waiting tickets curling out of it in a strip, the next one at the strip's end. When a
 *     ticket is hung its sheet moves from the strip to its clip, and when more wait than the strip shows, the printer feeds one more.
 *   - The expo's lane (the CPU) on the left and the line (the GPU) on the right, both running from the pass into the night. On the line
 *     each fire is a slab of the line's own steel, as wide as the rail and as long as its cook time, with a place for every clip on
 *     top: a plate (solid), an empty place (an open groove) or a binned plate (hollow). Dark stretches between fires are bubbles, drawn
 *     as outlines on the dark bed. On the expo's lane each fire has its plan (writing the call) and its read (reading the plates back);
 *     a fire with kernel launches adds a comb, one tooth per call, which collapses into one short replay slab when the fire hits a
 *     captured graph size.
 *   - The stations: a steel bar over the head of the line, just beyond the pass, with a heat element for each clip's row. An element
 *     burns where the latest fire cooked a course and is cold where its clip rode empty, and each burning one throws its warm light
 *     down its stretch of the line, so a fire rung with two of four clips hung leaves half the line dark, and a full rail lights it
 *     end to end. Heat is the world's one active light: a lit station burns in the lamp's amber, and no code colour marks a state.
 *
 * Every colour is a token role (src/design/tokens.ts) and every word or number is a DOM label anchored here (D-021, GAMES.md §2.6
 * rule 7). The layout's lengths are scene units [estimated], set by projecting these landmarks into the presets of scene-presets.ts.
 */
import type { ColorRoleName } from '@/design/tokens'
import type { Vec3 } from '@/scene/camera-rig'
import type { FixturePart } from '@/scene/fixture-geometry'
import type { ElementSpec, LampSpec } from '@/scene/Lights'
import type { CellDatum, MarkBox, MarkForm, SpanDatum } from '@/scene/marks'
import type { Sheet } from '@/scene/SheetInstances'
import { axisTicks, trackZ, type TimeWindow } from '@/scene/time-axis'
import { DETAIL_FIRES, stationsOf, ticketNo } from '@es/play/loop/layout'
import type { ClipView, FireView, LoopView, PlaceView } from '@es/play/loop/types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The world's measures                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The distance between two clips, and between two slot rows on the line. */
export const SLOT_PITCH = 0.6
/** Scene units per tick of the synthetic clock along the night: a 4-tick fire is about two thirds of a unit deep. */
export const UNITS_PER_TICK = 0.17
/** The ticks of history the scene draws behind the present: the night beyond it is lost in the fog anyway. */
export const HISTORY_TICKS = 120
/** The waiting tickets the printer's strip shows; the rest are still in the printer, and a label counts them. */
export const STRIP_TICKETS = 5
/** Above this many launch calls in one fire, the comb shows this many teeth and a label gives the count (GAMES.md §3, Budget). */
export const COMB_TEETH = 64

/** The line's left edge. */
const LINE_LEFT = -0.3
const LANE_GAP = 0.34
const CPU_WIDTH = 0.5
const PRINTER = { w: 0.56, h: 0.4, d: 0.48, gap: 0.24 }

/** The pass: its top, its front edge (the expo's side) and its back edge, where the line's counter begins. */
export const PASS = { top: 0.1, front: 2.3, back: -0.42, thick: 0.12 }
/** Where the present lies on the pass: just behind the rail, under the lamps. */
export const PRESENT_Z = 0.86
/** How far the line's counter and the lane beds run into the night. */
const LINE_LENGTH = 26

export const RAIL = { y: 2.2, z: 1.2 }
export const TICKET = { w: 0.42, h: 0.56 }
export const FIRED_RAIL = { y: 1.3, z: 0.6 }
export const FIRED_TICKET = { w: 0.32, h: 0.4 }
const WAITING = { w: 0.42, h: 0.34, curl: 0.3, gap: 0.008 }
const LAMP = { y: 2.42, z: 0.45 }
const GANTRY = { y: 3.05, z: 0.78 }
/**
 * The stations' bar: out on the line, a stretch beyond the pass's back edge, so a station that burns lights the line between the pass
 * and itself; high enough that the night's slabs slide under it, and low and near enough that the rail's tickets never hang in front
 * of it, in either framing [estimated, by projecting both].
 */
export const STATION_BAR = { y: 0.3, z: -1.25, h: 0.1, d: 0.06 }
/** A station's heat element: a tube on the bar's face, across its clip's row [estimated]. */
export const ELEMENT = { length: 0.46, diameter: 0.05 }
/**
 * Where a burning station throws its light: over its row, just behind the bar and a little above it, so the warmth falls on the line
 * from the pass's back edge out past the bar, and on the fire coming off the pass [estimated, by looking at both framings].
 */
export const GLOW = { y: 0.5, z: -1.5 }
/**
 * The most lights the stations throw, by tier: every light costs every lit pixel of the steel, so a laptop (T2 and up) gives a station
 * a light of its own up to four, and a phone (T1) gives the line one, hung over the stations that burn [estimated].
 */
export const MAX_GLOWS = { phone: 1, laptop: 4 } as const

/** The marks' heights: a fire's slab, a place on it, an empty place's groove, a dark stretch's outline, the expo's two phases. */
const SLAB_H = 0.07
const PLACE_H = 0.042
const GROOVE_H = 0.012
const DARK_H = 0.016
const PLAN_H = 0.06
const READ_H = 0.034
const TOOTH_H = 0.12
const REPLAY_H = 0.09
/** A place is a square a little narrower than its row, so the fire's lit slab shows around it. */
const PLACE_SHARE = 0.62
/** The track group's floor: the lane beds' top above the pass. */
export const TRACK_Y = PASS.top + 0.006

/* ------------------------------------------------------------------------------------------------------------------ */
/* The layout's shape                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

export type TicketKind = 'rail' | 'fired' | 'waiting'

/** A ticket's sheet of paper: a request on the rail, on the fired rail, or waiting in the printer's strip. */
export interface TicketSheet extends Sheet {
  readonly kind: TicketKind
  readonly req: number
}

export type AnchorKind = 'ticket' | 'fired' | 'waiting' | 'more' | 'empty' | 'tape' | 'tick' | 'axis' | 'axis-far' | 'station' | 'calls'

/** A label's anchor and its words: DOM over the canvas, never print in it. */
export interface Anchor {
  readonly id: string
  readonly kind: AnchorKind
  readonly at: Vec3
  /** `track` for a point on the clock, `sheet:<id>` for print that rides on a moving ticket, or none for the world. */
  readonly frame?: string
  readonly text: string
  /** A second, smaller line: a fresh ticket's "new". */
  readonly sub?: string
  readonly place?: 'center' | 'above' | 'below' | 'left' | 'right'
  /** Hidden in a canvas narrower than this, in CSS px. */
  readonly minWidth?: number
}

export interface Lanes {
  readonly cpuX: number
  readonly cpuWidth: number
  readonly gpuLeft: number
  readonly gpuX: number
  readonly gpuWidth: number
}

export interface LoopSceneLayout {
  readonly slots: number
  readonly unitsPerTime: number
  /** The clock at the present, and the earliest tick drawn. */
  readonly window: TimeWindow
  readonly lanes: Lanes
  /** Marks on the clock (the track's frame, which sits at the present on the pass): the fires' slabs, drawn in the line's steel. */
  readonly slabs: readonly SpanDatum[]
  /** The rest of the spans on the clock, in the code: the expo's plans, reads and combs, and the line's dark stretches. */
  readonly spans: readonly SpanDatum[]
  readonly places: readonly CellDatum[]
  /** The fire on the line, framed in the lamp's filament: the present's newest course, cooking. Null when nothing is on the line. */
  readonly onLine: MarkBox | null
  /** The steel. */
  readonly fixtures: readonly FixturePart[]
  /** The lamps' shades and the arm they hang from: over the present, so a shot looking straight down leaves them out. */
  readonly overhead: readonly FixturePart[]
  readonly lamps: readonly LampSpec[]
  readonly tickets: readonly TicketSheet[]
  readonly tapes: readonly Sheet[]
  readonly anchors: readonly Anchor[]
  /**
   * The line's stations: one for each clip, lit where the latest fire cooked a course (`stationsOf`), and their heat elements on the
   * bar. The light the burning ones throw down the line is `stationGlows` of them, at the scene's tier.
   */
  readonly stations: { readonly lit: readonly boolean[]; readonly elements: readonly ElementSpec[] }
  /** Waiting tickets the strip does not show: still in the printer. */
  readonly inPrinter: number
}

/** A light the stations throw down the line: where it hangs, and the share of its stations that burn, from 0 (dark) to 1. */
export interface StationGlow {
  readonly id: string
  readonly at: Vec3
  readonly share: number
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Where things are                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

export function lanesFor(slots: number): Lanes {
  const gpuWidth = slots * SLOT_PITCH
  const cpuX = LINE_LEFT - LANE_GAP - CPU_WIDTH / 2
  return { cpuX, cpuWidth: CPU_WIDTH, gpuLeft: LINE_LEFT, gpuX: LINE_LEFT + gpuWidth / 2, gpuWidth }
}

/** The centre of clip `slot` across the scene, which is also the centre of its row of places on the line. */
export const clipX = (slot: number): number => LINE_LEFT + (slot + 0.5) * SLOT_PITCH

/** The printer's centre: at the rail's left end, beyond the expo's lane. */
export function printerAt(slots: number): Vec3 {
  const lanes = lanesFor(slots)
  return [lanes.cpuX - CPU_WIDTH / 2 - PRINTER.gap - PRINTER.w / 2, RAIL.y + 0.04, RAIL.z - 0.04]
}

/**
 * The lights over the line's stations, `max` at most: one for each station, or, on a rail with more clips than that, one for each
 * run of neighbouring stations. Each hangs over the stations of its run that burn (over the run's middle when none does), as bright
 * as the share of the run that burns, so a light shared by a half-lit run leans to the burning half. The count depends on the rail
 * and the tier alone, never on what burns, so a fire changes a light's brightness and place and never the number of lights (which
 * would recompile every material in the scene).
 */
export function stationGlows(lit: readonly boolean[], max: number): StationGlow[] {
  const count = Math.max(1, Math.min(lit.length, max))
  return Array.from({ length: count }, (_, k) => {
    const from = Math.floor((k * lit.length) / count)
    const to = Math.floor(((k + 1) * lit.length) / count)
    const burning = lit.slice(from, to).flatMap((on, i) => (on ? [clipX(from + i)] : []))
    const x = burning.length > 0 ? burning.reduce((sum, at) => sum + at, 0) / burning.length : (clipX(from) + clipX(to - 1)) / 2
    return { id: `glow-${k}`, at: [x, GLOW.y, GLOW.z], share: burning.length / Math.max(1, to - from) }
  })
}

/** A small, fixed lean for a sheet, so a row of paper never looks stamped out: from its number, never from a random draw. */
const lean = (n: number, amount: number): number => ((((n * 37) % 11) / 11 - 0.5) * amount)

/**
 * A sheet hanging by its top edge from a clip at (x, y, z), its foot swung toward the expo by `tilt` radians so its face turns up to a
 * camera behind the expo: the centre sits half a sheet down the tilted sheet from the clip.
 */
function hanging(x: number, y: number, z: number, height: number, tilt: number): Vec3 {
  return [x, y - (height / 2) * Math.cos(tilt), z + (height / 2) * Math.sin(tilt)]
}

/** A rail ticket's sheet, hanging from clip `slot`. */
function railSheet(slot: number, clip: ClipView & { req: number }): TicketSheet {
  const tilt = 0.2
  return {
    id: `t${clip.req}`,
    kind: 'rail',
    req: clip.req,
    center: hanging(clipX(slot), RAIL.y - 0.035, RAIL.z + 0.04, TICKET.h, tilt),
    size: [TICKET.w, TICKET.h],
    rotation: [-tilt, 0, lean(clip.req, 0.07)],
  }
}

function firedSheet(slot: number, req: number): TicketSheet {
  const tilt = 0.16
  return {
    id: `f${req}`,
    kind: 'fired',
    req,
    center: hanging(clipX(slot), FIRED_RAIL.y - 0.03, FIRED_RAIL.z + 0.035, FIRED_TICKET.h, tilt),
    size: [FIRED_TICKET.w, FIRED_TICKET.h],
    rotation: [-tilt, 0, lean(req + 3, 0.06)],
  }
}

/**
 * The printer's strip: the waiting tickets, joined at their perforations, hanging out of the printer's mouth and curling toward the
 * expo. Segment 0 is at the mouth; the strip's free end holds the next ticket in line, so hanging it tears off the end, and when more
 * wait inside, the printer feeds the strip out by one ticket.
 */
export function stripSheets(slots: number, waiting: readonly number[]): TicketSheet[] {
  const shown = waiting.slice(0, STRIP_TICKETS)
  const [px, py, pz] = printerAt(slots)
  let y = py - PRINTER.h / 2 - 0.02
  let z = pz + PRINTER.d / 2 - 0.08
  const sheets: TicketSheet[] = []
  for (let segment = 0; segment < shown.length; segment++) {
    const phi = WAITING.curl * segment
    const dy = -Math.cos(phi)
    const dz = Math.sin(phi)
    const req = shown[shown.length - 1 - segment]
    sheets.push({
      id: `t${req}`,
      kind: 'waiting',
      req,
      center: [px + lean(req, 0.05), y + (dy * WAITING.h) / 2, z + (dz * WAITING.h) / 2],
      size: [WAITING.w, WAITING.h],
      rotation: [-phi, 0, lean(req + 1, 0.05)],
    })
    y += dy * (WAITING.h + WAITING.gap)
    z += dz * (WAITING.h + WAITING.gap)
  }
  return sheets
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The night                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const PLACE_FORMS: Readonly<Record<PlaceView['state'], MarkForm>> = { plate: 'solid', empty: 'groove', binned: 'hollow' }
/** An empty place is a dark station's well (the deep steel of `surface-3`), so a half-hung fire reads half dark from any shot. */
const PLACE_ROLE: Readonly<Record<PlaceView['state'], ColorRoleName>> = { plate: 'cat-white', empty: 'surface-3', binned: 'status-bad' }
/** A fire's slab is a sheet of the line's steel, in its shaded tone, so its white plates and dark wells read on it [estimated]. */
export const SLAB_ROLE: ColorRoleName = 'surface-2'

/** The marks of the fires in the window: slabs of steel, the dark stretches before them, and their places. */
function lineMarks(view: LoopView, window: TimeWindow, lanes: Lanes) {
  const slabs: SpanDatum[] = []
  const spans: SpanDatum[] = []
  const places: CellDatum[] = []
  const unitsPerTime = UNITS_PER_TICK
  const shown = view.fires.filter((fire) => fire.endUs > window.start)
  const detailFrom = shown.length - DETAIL_FIRES
  let onLine: MarkBox | null = null
  shown.forEach((fire, i) => {
    const before: FireView | undefined = view.fires[fire.index - 1]
    slabs.push({ id: `fire-${fire.index}`, lane: lanes.gpuX, start: fire.startUs, end: fire.endUs, width: lanes.gpuWidth, height: SLAB_H, base: 0, role: SLAB_ROLE })
    if (before !== undefined && fire.startUs > before.endUs) {
      spans.push({
        id: `dark-${fire.index}`,
        lane: lanes.gpuX,
        start: before.endUs,
        end: fire.startUs,
        width: lanes.gpuWidth,
        height: DARK_H,
        base: 0,
        role: 'lane-idle',
        form: 'hollow',
      })
    }
    const z0 = trackZ(fire.startUs, { unitsPerTime })
    const z1 = trackZ(fire.endUs, { unitsPerTime })
    if (i >= detailFrom) {
      const side = SLOT_PITCH * PLACE_SHARE
      const inset = Math.min(0.05, (z1 - z0) / 6)
      const depth = Math.max(0.004, Math.min(z1 - z0 - 2 * inset, side))
      fire.places.forEach((place, slot) => {
        const form = PLACE_FORMS[place.state]
        places.push({
          id: `fire-${fire.index}/place-${slot}`,
          x: clipX(slot),
          z: (z0 + z1) / 2,
          y: SLAB_H,
          width: side,
          depth,
          height: form === 'groove' ? GROOVE_H : PLACE_H,
          role: PLACE_ROLE[place.state],
          form,
        })
      })
    }
    // The fire the line is cooking, at the present: the lamp's filament frames its slab and its places.
    if (fire.onLine) {
      onLine = { id: `on-line-${fire.index}`, center: [lanes.gpuX, (SLAB_H + PLACE_H) / 2, (z0 + z1) / 2], size: [lanes.gpuWidth, SLAB_H + PLACE_H, z1 - z0], role: 'lamp-ring', form: 'solid' }
    }
  })
  return { slabs, spans, places, onLine: onLine as MarkBox | null }
}

/** The expo's lane: a plan slab and a read slab for each fire, and a fire's launch calls as a comb, or its replay as one slab. */
function expoMarks(view: LoopView, window: TimeWindow, lanes: Lanes): { spans: SpanDatum[]; anchors: Anchor[] } {
  const spans: SpanDatum[] = []
  const anchors: Anchor[] = []
  const width = lanes.cpuWidth * 0.84
  const fireAt = new Map(view.fires.map((fire) => [fire.index, fire]))
  for (const span of view.cpu) {
    if (span.endUs <= window.start) continue
    const id = `cpu-${span.step}-${span.kind}`
    if (span.kind === 'schedule' || span.kind === 'prepare') {
      spans.push({ id, lane: lanes.cpuX, start: span.startUs, end: span.endUs, width, height: PLAN_H, base: 0, role: 'lane-cpu' })
    } else if (span.kind === 'sync' || span.kind === 'sample') {
      spans.push({ id, lane: lanes.cpuX, start: span.startUs, end: span.endUs, width, height: READ_H, base: 0, role: 'lane-sync' })
    } else if (span.kind === 'launch') {
      const fire = fireAt.get(span.step)
      const calls = fire?.launches ?? 0
      if (fire?.graph === 'hit') {
        // One word fires a drilled routine: the comb collapses into one short slab.
        spans.push({ id: `${id}-replay`, lane: lanes.cpuX, start: span.startUs, end: span.endUs, width, height: REPLAY_H, base: 0, role: 'lane-cpu', form: 'marked' })
      } else if (calls > 0) {
        // Calling each dish: one tooth per launch call, evenly through the launch phase.
        const teeth = Math.min(calls, COMB_TEETH)
        const pitch = (span.endUs - span.startUs) / teeth
        for (let tooth = 0; tooth < teeth; tooth++) {
          const start = span.startUs + tooth * pitch
          spans.push({ id: `${id}-tooth-${tooth}`, lane: lanes.cpuX, start, end: start + pitch / 2, width, height: TOOTH_H, base: 0, role: 'lane-cpu' })
        }
        if (calls > COMB_TEETH) {
          anchors.push({ id: `calls-${span.step}`, kind: 'calls', at: [lanes.cpuX - lanes.cpuWidth / 2 - 0.06, 0, trackZ((span.startUs + span.endUs) / 2, { unitsPerTime: UNITS_PER_TICK })], frame: 'track', text: `${calls} calls`, place: 'left' })
        }
      }
    }
  }
  return { spans, anchors }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The steel and the light                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

function fixturesFor(slots: number, fired: boolean, printer = true): { fixtures: FixturePart[]; overhead: FixturePart[]; lamps: LampSpec[]; extent: { left: number; right: number } } {
  const lanes = lanesFor(slots)
  const [px, py, pz] = printerAt(slots)
  const lastClip = clipX(slots - 1)
  // The gantry stands just outside the printer and the rail; the counter runs on past it, out of a wide frame.
  const left = px - PRINTER.w / 2 - 0.55
  const right = lastClip + SLOT_PITCH / 2 + 0.75
  const width = right - left + 2.4
  const mid = (left + right) / 2
  const railLeft = px + PRINTER.w / 2 - 0.02
  const railRight = lastClip + SLOT_PITCH / 2 + 0.18
  const postLeft = left + 0.16
  const postRight = right - 0.16
  const passDepth = PASS.front - PASS.back
  const fixtures: FixturePart[] = [
    // The pass: the counter, its rolled front edge and the apron below it.
    { kind: 'box', center: [mid, PASS.top - PASS.thick / 2, (PASS.front + PASS.back) / 2], size: [width, PASS.thick, passDepth], tone: 'bright' },
    { kind: 'box', center: [mid, PASS.top - 0.005, PASS.front + 0.02], size: [width, 0.05, 0.06], tone: 'bright' },
    { kind: 'box', center: [mid, PASS.top - 0.32, PASS.front + 0.035], size: [width, 0.6, 0.03], tone: 'shaded' },
    // The line's counter behind it, and a seam where the pass ends.
    { kind: 'box', center: [mid, PASS.top - PASS.thick / 2 - 0.004, PASS.back - LINE_LENGTH / 2], size: [width + 3, PASS.thick, LINE_LENGTH], tone: 'shaded' },
    { kind: 'box', center: [mid, PASS.top - 0.002, PASS.back], size: [width, 0.008, 0.035], tone: 'deep' },
    // The lane beds, inset along the pass and down the line: the expo's in shaded steel, the line's in deep steel, so a lit fire
    // stands out on it and a dark stretch shows the dark bed.
    { kind: 'box', center: [lanes.cpuX, PASS.top + 0.002, PRESENT_Z + 0.06 - (LINE_LENGTH + PRESENT_Z) / 2], size: [lanes.cpuWidth + 0.1, 0.006, LINE_LENGTH + PRESENT_Z + 0.12], tone: 'shaded' },
    { kind: 'box', center: [lanes.gpuX, PASS.top + 0.002, PRESENT_Z + 0.06 - (LINE_LENGTH + PRESENT_Z) / 2], size: [lanes.gpuWidth + 0.1, 0.006, LINE_LENGTH + PRESENT_Z + 0.12], tone: 'deep' },
    // The gantry: two posts off the pass and a beam the lamps hang from.
    { kind: 'rod', base: [postLeft, PASS.top, GANTRY.z], height: GANTRY.y - PASS.top, radius: 0.03, tone: 'shaded' },
    { kind: 'rod', base: [postRight, PASS.top, GANTRY.z], height: GANTRY.y - PASS.top, radius: 0.03, tone: 'shaded' },
    { kind: 'box', center: [(postLeft + postRight) / 2, GANTRY.y + 0.03, GANTRY.z], size: [postRight - postLeft + 0.12, 0.07, 0.09], tone: 'deep' },
    // The rail, with its clips, held off the left post by the printer's bracket and off the right post by its own.
    { kind: 'box', center: [(railLeft + railRight) / 2, RAIL.y, RAIL.z], size: [railRight - railLeft, 0.05, 0.06], tone: 'deep' },
    { kind: 'box', center: [(railRight + postRight) / 2, RAIL.y, (RAIL.z + GANTRY.z) / 2], size: [postRight - railRight + 0.03, 0.035, RAIL.z - GANTRY.z + 0.04], tone: 'shaded' },
    // The stations' bar over the head of the line, on a post at each end.
    { kind: 'box', center: [lanes.gpuX, STATION_BAR.y, STATION_BAR.z], size: [lanes.gpuWidth + 0.12, STATION_BAR.h, STATION_BAR.d], tone: 'deep' },
    { kind: 'rod', base: [lanes.gpuLeft - 0.08, PASS.top, STATION_BAR.z], height: STATION_BAR.y - PASS.top, radius: 0.014, tone: 'shaded' },
    { kind: 'rod', base: [lanes.gpuLeft + lanes.gpuWidth + 0.08, PASS.top, STATION_BAR.z], height: STATION_BAR.y - PASS.top, radius: 0.014, tone: 'shaded' },
  ]
  if (printer) {
    fixtures.push(
      { kind: 'box', center: [(postLeft + px) / 2, py, (pz + GANTRY.z) / 2], size: [px - postLeft, 0.035, Math.abs(pz - GANTRY.z) + 0.04], tone: 'shaded' },
      // The printer: its housing, its lid and the dark mouth the strip comes out of.
      { kind: 'box', center: [px, py, pz], size: [PRINTER.w, PRINTER.h, PRINTER.d], tone: 'deep' },
      { kind: 'box', center: [px, py + PRINTER.h / 2 + 0.02, pz - 0.03], size: [PRINTER.w - 0.04, 0.04, PRINTER.d - 0.1], tone: 'shaded' },
      { kind: 'box', center: [px, py - PRINTER.h / 2 + 0.005, pz + PRINTER.d / 2 - 0.08], size: [PRINTER.w - 0.08, 0.012, 0.06], tone: 'shaded' },
    )
  }
  for (let slot = 0; slot < slots; slot++) {
    fixtures.push({ kind: 'box', center: [clipX(slot), RAIL.y - 0.03, RAIL.z + 0.035], size: [0.09, 0.075, 0.035], tone: 'shaded' })
  }
  if (fired) {
    const firedLeft = lanes.gpuLeft - 0.12
    const firedRight = lastClip + SLOT_PITCH / 2 + 0.1
    fixtures.push({ kind: 'box', center: [(firedLeft + firedRight) / 2, FIRED_RAIL.y, FIRED_RAIL.z], size: [firedRight - firedLeft, 0.04, 0.05], tone: 'deep' })
    // It hangs from the gantry's beam on two rods.
    for (const x of [firedLeft + 0.06, firedRight - 0.06]) {
      fixtures.push({ kind: 'rod', base: [x, FIRED_RAIL.y, FIRED_RAIL.z], height: GANTRY.y - FIRED_RAIL.y, radius: 0.012, tone: 'shaded' })
    }
    for (let slot = 0; slot < slots; slot++) {
      fixtures.push({ kind: 'box', center: [clipX(slot), FIRED_RAIL.y - 0.025, FIRED_RAIL.z + 0.03], size: [0.07, 0.06, 0.03], tone: 'shaded' })
    }
  }
  // Three heat lamps over the present: one over the expo's lane, two over the line, between its rows so a top shot sees past them.
  const lampXs = [lanes.cpuX, lanes.gpuLeft + SLOT_PITCH, lanes.gpuLeft + 3 * SLOT_PITCH]
  const lamps: LampSpec[] = lampXs.map((x, i) => ({ id: `lamp-${i}`, at: [x, LAMP.y, LAMP.z], target: [x, PASS.top, PRESENT_Z - 0.28] }))
  const overhead: FixturePart[] = []
  for (const lamp of lamps) {
    overhead.push({ kind: 'shade', center: [lamp.at[0], lamp.at[1] - 0.05, lamp.at[2]], mouth: 0.2, crown: 0.07, height: 0.26, tone: 'deep' })
    overhead.push({ kind: 'rod', base: [lamp.at[0], lamp.at[1] + 0.2, lamp.at[2]], height: GANTRY.y - lamp.at[1] - 0.2, radius: 0.012, tone: 'shaded' })
  }
  // The lamps' stems meet an arm under the beam, which sits nearer the expo.
  overhead.push({ kind: 'box', center: [(lampXs[0] + lampXs[2]) / 2, GANTRY.y - 0.02, (GANTRY.z + LAMP.z) / 2], size: [lampXs[2] - lampXs[0] + 0.14, 0.03, GANTRY.z - LAMP.z + 0.04], tone: 'shaded' })
  return { fixtures, overhead, lamps, extent: { left, right } }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The layout                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Labels that need a desktop's room: the clock's numbers [estimated]. */
const ROOMY = 560

/** What a page may leave out of the scene: the printer and its strip, when the page holds a printer of its own (the front page). */
export interface SceneOptions {
  readonly printer?: boolean
}

export function sceneLayout(view: LoopView, options: SceneOptions = {}): LoopSceneLayout {
  const printer = options.printer ?? true
  const slots = view.slots
  const lanes = lanesFor(slots)
  const now = view.clockUs
  const window: TimeWindow = { start: Math.max(0, now - HISTORY_TICKS), now }
  const line = lineMarks(view, window, lanes)
  const expo = expoMarks(view, window, lanes)
  const fired = view.firedRail !== null
  const { fixtures, overhead, lamps } = fixturesFor(slots, fired, printer)

  // The paper: the rail's tickets, the fired rail's, and the printer's strip.
  const tickets: TicketSheet[] = []
  const anchors: Anchor[] = [...expo.anchors]
  view.rail.forEach((clip, slot) => {
    if (clip.req === null) {
      anchors.push({ id: `empty-${slot}`, kind: 'empty', at: [clipX(slot), RAIL.y - 0.16, RAIL.z + 0.04], text: 'empty' })
      return
    }
    const sheet = railSheet(slot, { ...clip, req: clip.req })
    tickets.push(sheet)
    anchors.push({ id: `ticket-${clip.req}`, kind: 'ticket', at: [sheet.center[0], sheet.center[1] + 0.06, sheet.center[2]], frame: `sheet:${sheet.id}`, text: ticketNo(clip.req), sub: clip.fresh ? 'new' : undefined })
  })
  view.firedRail?.forEach((clip, slot) => {
    if (clip.req === null) return
    const sheet = firedSheet(slot, clip.req)
    tickets.push(sheet)
    anchors.push({ id: `fired-${clip.req}`, kind: 'fired', at: sheet.center, frame: `sheet:${sheet.id}`, text: ticketNo(clip.req) })
  })
  const strip = printer ? stripSheets(slots, view.waiting) : []
  for (const sheet of strip) {
    tickets.push(sheet)
    anchors.push({ id: `waiting-${sheet.req}`, kind: 'waiting', at: sheet.center, frame: `sheet:${sheet.id}`, text: ticketNo(sheet.req) })
  }
  const inPrinter = Math.max(0, view.waiting.length - strip.length)
  const [px, py, pz] = printerAt(slots)
  if (printer && inPrinter > 0) anchors.push({ id: 'more', kind: 'more', at: [px, py + 0.02, pz + PRINTER.d / 2 + 0.01], text: `+${inPrinter}` })

  // Masking tape on the pass in front of each lane, where the expo reads it.
  const tapeY = PASS.top + 0.004
  const tapeZ = PRESENT_Z + 0.5
  const tapes: Sheet[] = [
    { id: 'tape-cpu', center: [lanes.cpuX, tapeY, tapeZ], size: [0.62, 0.11], rotation: [-Math.PI / 2, 0, 0.02] },
    { id: 'tape-gpu', center: [lanes.gpuX, tapeY, tapeZ], size: [0.78, 0.11], rotation: [-Math.PI / 2, 0, -0.015] },
  ]
  anchors.push({ id: 'tape-cpu', kind: 'tape', at: [lanes.cpuX, tapeY, tapeZ], text: 'the expo · cpu' })
  anchors.push({ id: 'tape-gpu', kind: 'tape', at: [lanes.gpuX, tapeY, tapeZ], text: 'the line · gpu' })

  // The clock along the line's right edge, in synthetic ticks (D-048). The tick at the present itself would sit under the rail.
  const axisX = lanes.gpuLeft + lanes.gpuWidth + 0.16
  const ticks = axisTicks(window, 6)
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 0
  for (const t of ticks) {
    if (step === 0 || now - t < step * 0.6) continue
    anchors.push({ id: `tick-${t}`, kind: 'tick', at: [axisX + 0.06, 0, trackZ(t, { unitsPerTime: UNITS_PER_TICK })], frame: 'track', text: String(t), place: 'right', minWidth: ROOMY })
  }
  // What the clock counts: on the pass where the axis starts, ending at the line's right edge so it stays in a narrow frame; and, for
  // the side shot, at the axis's far end, where that shot reads the clock from.
  const lineRight = lanes.gpuLeft + lanes.gpuWidth
  anchors.push({ id: 'axis', kind: 'axis', at: [lineRight, PASS.top, PRESENT_Z + 0.24], text: 'ticks · synthetic', place: 'left', minWidth: ROOMY })
  const far = ticks.find((t) => step > 0 && now - t >= step * 0.6)
  if (far !== undefined) {
    anchors.push({ id: 'axis-far', kind: 'axis-far', at: [axisX + 0.06, 0.32, trackZ(far, { unitsPerTime: UNITS_PER_TICK })], frame: 'track', text: 'ticks · synthetic', place: 'above', minWidth: ROOMY })
  }

  // The stations: a heat element on the bar's face for each clip's row, the light the burning ones throw down the line, and their
  // count on the pass under the line's tape (the DOM says how many are lit; the light is never the only carrier).
  const lit = stationsOf(view)
  const elements: ElementSpec[] = lit.map((on, slot) => ({
    id: `station-${slot}`,
    at: [clipX(slot), STATION_BAR.y, STATION_BAR.z + STATION_BAR.d / 2 + ELEMENT.diameter / 2 + 0.008],
    length: ELEMENT.length,
    diameter: ELEMENT.diameter,
    lit: on,
  }))
  const litCount = lit.filter(Boolean).length
  anchors.push({ id: 'station', kind: 'station', at: [lanes.gpuX, tapeY, tapeZ + 0.55], text: `${litCount} of ${slots} lit` })

  return {
    slots,
    unitsPerTime: UNITS_PER_TICK,
    window,
    lanes,
    slabs: line.slabs,
    spans: [...line.spans, ...expo.spans],
    places: line.places,
    onLine: line.onLine,
    fixtures,
    overhead,
    lamps,
    tickets,
    tapes,
    anchors,
    stations: { lit, elements },
    inPrinter,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What moved                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How the latest change moves: on the bell, as the printer's feed, or as a cut (a new level, an undo, the first frame). */
export type Change = { readonly key: number; readonly kind: 'bell' | 'feed' | 'cut' }

/** Reads what a new view changed from the one before: a fire rung is the bell, a ticket hung between bells is the printer. */
export function changeOf(before: LoopView | null, after: LoopView): Change['kind'] {
  if (before === null || before.level !== after.level) return 'cut'
  if (after.step > before.step) return 'bell'
  if (after.step < before.step || after.waiting.length > before.waiting.length) return 'cut'
  if (after.waiting.length < before.waiting.length) return 'feed'
  return 'cut'
}

/** The present's frame in the world: the track group sits here, so the clock's `now` lands on the pass under the rail. */
export const TRACK_ORIGIN: Vec3 = [0, TRACK_Y, PRESENT_Z]
