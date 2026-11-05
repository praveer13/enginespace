import { useId, type ReactNode } from 'react'
import { cellOf, serviceAt, stationsLit, SUBJECT_INFO, type Subject } from './kitchen-specimen'

/*
 * The kitchen's 2D notes (scene kit v1, on /design): each piece of equipment drawn flat, front on, in the kitchen's own materials
 * (brushed steel, tile and grout, glaze, bond paper with its dots, masking tape and marker, the lamp's amber only where something
 * is lit), never as a chart. The same drawing is the Stage's first paint and its view when 3D cannot run, and it sits beside the 3D
 * view on the spec sheet. It draws the specimen's service at the same bell as the scene: the tickets on the rail, the spike's stack,
 * the plates on the pass and the stations that burn. Every colour is a role, through kitchen.css's classes.
 */

export interface KitchenDrawingProps {
  subject: Subject
  step: number
  /** `twin` fills the Stage's box; `note` is the small drawing on the spec sheet. */
  variant?: 'twin' | 'note'
}

const W = 480
const H = 300

/** A ticket hanging from a clip: paper, its head left for the number, then dotted lines of print. */
function Ticket({ x, y, w = 26, h = 38, no }: { x: number; y: number; w?: number; h?: number; no?: number }) {
  const rows = [0.44, 0.58, 0.72]
  return (
    <g>
      <rect className="es-draw__paper es-draw__lifted" x={x - w / 2} y={y} width={w} height={h} />
      {no !== undefined ? (
        <text className="es-draw__print" x={x} y={y + h * 0.26} textAnchor="middle">
          {no}
        </text>
      ) : null}
      {rows.map((row, i) => (
        <line key={row} className="es-draw__dots" x1={x - w / 2 + 4} x2={x + w / 2 - (i === 2 ? 9 : 4)} y1={y + h * row} y2={y + h * row} />
      ))}
    </g>
  )
}

/** A plate seen from a little above: its rim and its well. */
function Plate({ x, y, r = 24 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <ellipse className="es-draw__shadow" cx={x} cy={y + 3} rx={r * 0.95} ry={r * 0.24} />
      <ellipse className="es-draw__glaze" cx={x} cy={y} rx={r} ry={r * 0.28} />
      <ellipse className="es-draw__well" cx={x} cy={y + 0.6} rx={r * 0.62} ry={r * 0.16} />
    </g>
  )
}

/** A counter's top seen front on: the brushed top, its rolled front edge, and the apron under it. */
function Counter({ x, y, w, legs = true, floor = 286 }: { x: number; y: number; w: number; legs?: boolean; floor?: number }) {
  return (
    <g>
      {legs ? (
        <>
          <rect className="es-draw__steel-side" x={x + 10} y={y + 12} width={7} height={floor - y - 12} rx={3} />
          <rect className="es-draw__steel-side" x={x + w - 17} y={y + 12} width={7} height={floor - y - 12} rx={3} />
          <rect className="es-draw__steel-shaded" x={x + 8} y={floor - 46} width={w - 16} height={6} rx={2} />
          <ellipse className="es-draw__shadow" cx={x + w / 2} cy={floor + 2} rx={w * 0.5} ry={5} />
        </>
      ) : null}
      <rect className="es-draw__steel" x={x} y={y} width={w} height={9} rx={2} />
      <rect className="es-draw__steel-side" x={x - 1} y={y + 6} width={w + 2} height={7} rx={3.5} />
      <rect className="es-draw__steel-shaded" x={x + 4} y={y + 13} width={w - 8} height={12} rx={2} />
    </g>
  )
}

/** The wall of subway tile and the sealed floor under it, down to `floor`. */
function Room({ ids, floor = 286 }: { ids: Ids; floor?: number }) {
  return (
    <g>
      <rect fill={`url(#${ids.tile})`} className="es-draw__tile" x={0} y={0} width={W} height={floor} />
      <rect className="es-draw__cove" x={0} y={floor - 6} width={W} height={6} />
      <rect fill={`url(#${ids.floor})`} className="es-draw__floor" x={0} y={floor} width={W} height={H - floor} />
    </g>
  )
}

/** A heat lamp's spun shade on its cord, glowing at its mouth, and the pool it throws on the steel below at `pool`. */
function Lamp({ x, top, mouth, pool, lit = true, ids }: { x: number; top: number; mouth: number; pool: number; lit?: boolean; ids: Ids }) {
  return (
    <g>
      {lit ? <ellipse fill={`url(#${ids.pool})`} cx={x} cy={pool} rx={58} ry={11} /> : null}
      <line className="es-draw__cord" x1={x} y1={top} x2={x} y2={mouth - 30} />
      <path className="es-draw__alu" d={`M${x - 7} ${mouth - 32} L${x + 7} ${mouth - 32} C${x + 12} ${mouth - 20} ${x + 26} ${mouth - 8} ${x + 30} ${mouth} L${x - 30} ${mouth} C${x - 26} ${mouth - 8} ${x - 12} ${mouth - 20} ${x - 7} ${mouth - 32} Z`} />
      <rect className="es-draw__alu-lip" x={x - 31} y={mouth - 2} width={62} height={4} rx={2} />
      {lit ? <ellipse fill={`url(#${ids.glow})`} cx={x} cy={mouth + 2} rx={26} ry={9} /> : <ellipse className="es-draw__cold" cx={x} cy={mouth + 1} rx={16} ry={4} />}
    </g>
  )
}

/** One of the line's stations, front on: its cabinet, its knobs and what it cooks on, burning in amber when lit. */
function Station({ kind, x, w, top, lit, ids, floor = 286 }: { kind: 'griddle' | 'burners' | 'fryer'; x: number; w: number; top: number; lit: boolean; ids: Ids; floor?: number }) {
  const knobs = kind === 'griddle' ? 3 : kind === 'burners' ? 4 : 2
  return (
    <g>
      <ellipse className="es-draw__shadow" cx={x + w / 2} cy={floor + 1} rx={w * 0.52} ry={4} />
      <rect className="es-draw__steel" x={x} y={top} width={w} height={floor - top - 8} rx={3} />
      <rect className="es-draw__steel-shaded" x={x} y={top + 4} width={w} height={16} rx={3} />
      {Array.from({ length: knobs }, (_, k) => (
        <circle key={k} className="es-draw__knob" cx={x + (w * (k + 0.5)) / knobs} cy={top + 12} r={4} />
      ))}
      <circle className={lit ? 'es-draw__pilot-lit' : 'es-draw__cold'} cx={x + w - 6} cy={top + 22} r={2} />
      {kind === 'griddle' ? (
        <>
          <rect className="es-draw__iron" x={x + 2} y={top - 6} width={w - 4} height={6} rx={1} />
          <rect className="es-draw__steel" x={x} y={top - 20} width={w} height={14} rx={2} />
          {lit ? <rect fill={`url(#${ids.heat})`} x={x + 3} y={top - 3} width={w - 6} height={4} /> : null}
        </>
      ) : null}
      {kind === 'burners' ? (
        <>
          <rect className="es-draw__steel" x={x} y={top - 4} width={w} height={4} rx={1} />
          {[0.25, 0.75].map((share) => (
            <g key={share}>
              {lit ? <ellipse fill={`url(#${ids.glow})`} cx={x + w * share} cy={top - 6} rx={w * 0.2} ry={4} /> : null}
              <path className="es-draw__grate" d={`M${x + w * share - w * 0.2} ${top - 4} v-8 h${w * 0.4} v8 M${x + w * share - w * 0.07} ${top - 12} v8 M${x + w * share + w * 0.07} ${top - 12} v8`} />
            </g>
          ))}
        </>
      ) : null}
      {kind === 'fryer' ? (
        <>
          <rect className="es-draw__steel" x={x} y={top - 4} width={w} height={4} rx={1} />
          {[0.27, 0.73].map((share) => (
            <g key={share}>
              {lit ? <ellipse fill={`url(#${ids.glow})`} cx={x + w * share} cy={top - 4} rx={w * 0.18} ry={3} /> : null}
              <path className="es-draw__wire" d={`M${x + w * share} ${top - 2} l0 -16 l10 -8`} />
              <rect className="es-draw__knob" x={x + w * share + 8} y={top - 28} width={10} height={5} rx={2.5} />
            </g>
          ))}
        </>
      ) : null}
    </g>
  )
}

/** A hotel pan front on: its sheet's taper, the rolled rim, and its masking tape with the marker's word. */
function Pan({ x, y, w, h, tape }: { x: number; y: number; w: number; h: number; tape?: string }) {
  return (
    <g>
      <ellipse className="es-draw__shadow" cx={x + w / 2} cy={y + h + 2} rx={w * 0.48} ry={3} />
      <path className="es-draw__steel" d={`M${x} ${y} L${x + w} ${y} L${x + w - 5} ${y + h - 4} Q${x + w - 6} ${y + h} ${x + w - 10} ${y + h} L${x + 10} ${y + h} Q${x + 6} ${y + h} ${x + 5} ${y + h - 4} Z`} />
      <rect className="es-draw__steel-side" x={x - 3} y={y - 3} width={w + 6} height={5} rx={2.5} />
      {tape ? (
        <g transform={`rotate(-1.2 ${x + w / 2} ${y + 6})`}>
          <rect className="es-draw__tape" x={x + w / 2 - 20} y={y + 2} width={40} height={11} />
          <text className="es-draw__marker" x={x + w / 2} y={y + 10.5} textAnchor="middle">
            {tape}
          </text>
        </g>
      ) : null}
    </g>
  )
}

interface Ids {
  readonly tile: string
  readonly floor: string
  readonly glow: string
  readonly pool: string
  readonly heat: string
}

/** The service bell: its deep-steel base, its chrome dome and plunger. */
function Bell({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse className="es-draw__shadow" cx={0} cy={1} rx={34} ry={4} />
      <rect className="es-draw__steel-deep" x={-32} y={-9} width={64} height={9} rx={3} />
      <path className="es-draw__chrome" d="M-29 -9 C-29 -30 -16 -40 0 -40 C16 -40 29 -30 29 -9 Z" />
      <rect className="es-draw__chrome" x={-2} y={-49} width={4} height={10} />
      <circle className="es-draw__chrome" cx={0} cy={-51} r={4.5} />
      <path className="es-draw__shine" d="M-18 -16 C-18 -26 -11 -33 -3 -35" />
    </g>
  )
}

/** The ticket printer: its deep-steel housing, the roll in its cradle, the tear bar, and the paper curling out with its print. */
function Printer({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse className="es-draw__shadow" cx={0} cy={1} rx={58} ry={5} />
      <rect className="es-draw__steel-deep" x={-52} y={-78} width={104} height={78} rx={9} />
      <rect className="es-draw__steel-deep" x={-48} y={-100} width={70} height={26} rx={8} />
      <ellipse className="es-draw__roll" cx={30} cy={-84} rx={20} ry={14} />
      <ellipse className="es-draw__steel-deep" cx={30} cy={-84} rx={5} ry={4} />
      <rect className="es-draw__chrome" x={-40} y={-81} width={80} height={4} rx={2} />
      <path className="es-draw__paper es-draw__lifted" d="M-26 -79 L26 -79 C30 -50 28 -26 16 -12 C10 -6 2 -6 -4 -10 L-30 -10 C-20 -26 -24 -56 -26 -79 Z" />
      {[-64, -54, -44, -34].map((row) => (
        <line key={row} className="es-draw__dots" x1={-20} x2={18} y1={row} y2={row} />
      ))}
    </g>
  )
}

/** The ticket spike: its weighted base, its spindle, and the finished tickets pressed down on it. */
function Spike({ x, y, count, s = 1 }: { x: number; y: number; count: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse className="es-draw__shadow" cx={0} cy={1} rx={24} ry={3} />
      <rect className="es-draw__steel-deep" x={-22} y={-8} width={44} height={8} rx={4} />
      <rect className="es-draw__chrome" x={-1.2} y={-80} width={2.4} height={72} />
      {Array.from({ length: count }, (_, k) => (
        <rect key={k} className="es-draw__paper" x={-24 + ((k * 7) % 9) - 4} y={-10 - k * 3} width={44} height={2.4} />
      ))}
    </g>
  )
}

/** The rail across the top on its bar, a chrome ball at every clip, and a ticket in each clip that holds one. */
function Rail({ x, y, w, clips, tickets }: { x: number; y: number; w: number; clips: number; tickets: readonly { clip: number; no: number }[] }) {
  const clipX = (clip: number) => x + w - (w / clips) * (clip + 0.5)
  return (
    <g>
      <rect className="es-draw__steel-side" x={x - 8} y={y - 12} width={w + 16} height={7} rx={3.5} />
      <rect className="es-draw__steel" x={x} y={y - 4} width={w} height={11} rx={3} />
      <rect className="es-draw__steel-deep" x={x + 2} y={y + 6} width={w - 4} height={2} />
      {Array.from({ length: clips }, (_, clip) => (
        <circle key={clip} className="es-draw__chrome" cx={clipX(clip)} cy={y + 9} r={3} />
      ))}
      {tickets.map((ticket) => (
        <Ticket key={ticket.no} x={clipX(ticket.clip)} y={y + 10} no={ticket.no} />
      ))}
    </g>
  )
}

/** The hood over the line: its canopy and skirt, the baffle filters under it, and its tube lights. */
function Hood({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <path className="es-draw__steel" d={`M${x} ${y} L${x + w} ${y} L${x + w} ${y + 34} L${x} ${y + 34} Z`} />
      <rect className="es-draw__steel-shaded" x={x - 3} y={y + 32} width={w + 6} height={6} rx={3} />
      <path className="es-draw__baffle" d={Array.from({ length: Math.floor(w / 10) }, (_, k) => `M${x + 6 + k * 10} ${y + 8} l5 9 l-5 9`).join(' ')} />
      <rect className="es-draw__tube" x={x + w * 0.2} y={y + 38} width={w * 0.18} height={3} rx={1.5} />
      <rect className="es-draw__tube" x={x + w * 0.62} y={y + 38} width={w * 0.18} height={3} rx={1.5} />
    </g>
  )
}

function drawing(subject: Subject, step: number, ids: Ids): ReactNode {
  const service = serviceAt(step)
  const lit = stationsLit(service)
  const alone = step % 2 === 0
  const bench = (contents: ReactNode) => (
    <>
      <Room ids={ids} />
      <Counter x={70} y={214} w={340} />
      {contents}
    </>
  )
  switch (subject) {
    case 'assembled':
      return (
        <>
          <Room ids={ids} floor={250} />
          <Hood x={90} y={46} w={260} />
          <Station kind="griddle" x={110} w={96} top={156} lit={lit[0]} ids={ids} floor={250} />
          <Station kind="burners" x={210} w={66} top={156} lit={lit[1]} ids={ids} floor={250} />
          <Station kind="fryer" x={280} w={52} top={156} lit={lit[2]} ids={ids} floor={250} />
          {[-1, 0, 1].map((k) => (
            <Lamp key={k} x={240 + k * 104} top={0} mouth={58} pool={208} ids={ids} />
          ))}
          <Rail x={120} y={110} w={240} clips={4} tickets={service.rail} />
          <Counter x={28} y={212} w={424} floor={300} />
          {service.rail.map((ticket) => (
            <Plate key={ticket.no} x={360 - 60 * ticket.clip - 30} y={210} r={22} />
          ))}
          <Printer x={64} y={212} s={0.42} />
          <Bell x={372} y={212} s={0.42} />
          <Spike x={426} y={212} count={Math.min(service.spiked.length, 6)} s={0.42} />
        </>
      )
    case 'pass':
      return (
        <>
          <Room ids={ids} />
          <rect className="es-draw__steel-side" x={92} y={104} width={6} height={110} rx={3} />
          <rect className="es-draw__steel-side" x={382} y={104} width={6} height={110} rx={3} />
          <rect fill={`url(#${ids.heat})`} x={100} y={118} width={280} height={96} />
          <rect className="es-draw__steel" x={84} y={96} width={312} height={16} rx={5} />
          <rect className="es-draw__glow-strip" x={110} y={110} width={260} height={4} rx={2} />
          <Counter x={60} y={214} w={360} />
          {[0, 1, 2].map((k) => (
            <Plate key={k} x={150 + k * 90} y={212} />
          ))}
        </>
      )
    case 'lamp':
      return bench(<Lamp x={240} top={0} mouth={142} pool={214} lit={alone} ids={ids} />)
    case 'rail':
      return bench(
        <>
          <Rail x={100} y={70} w={280} clips={4} tickets={service.rail} />
          <Spike x={360} y={214} count={Math.min(service.spiked.length, 6)} s={0.9} />
        </>,
      )
    case 'printer':
      return bench(<Printer x={240} y={214} />)
    case 'bell':
      return bench(<Bell x={240} y={214} s={1.6} />)
    case 'plates':
      return bench(
        <>
          {[0, 1, 2, 3, 4].map((k) => (
            <Plate key={k} x={352} y={212 - k * 4} r={30} />
          ))}
          {service.rail.map((ticket, i) => (
            <Plate key={ticket.no} x={118 + i * 62} y={212} r={28} />
          ))}
        </>,
      )
    case 'pans':
      return bench(
        <>
          <Pan x={86} y={176} w={150} h={36} tape="grp 1" />
          <Pan x={252} y={160} w={92} h={52} tape="grp 2" />
          <Pan x={356} y={176} w={56} h={36} tape="kit" />
        </>,
      )
    case 'spike':
      return bench(<Spike x={240} y={214} count={Math.min(service.spiked.length, 4)} s={1.6} />)
    case 'griddle':
    case 'burners':
    case 'fryer': {
      const w = subject === 'griddle' ? 210 : subject === 'burners' ? 150 : 120
      return (
        <>
          <Room ids={ids} />
          <Station kind={subject} x={240 - w / 2} w={w} top={150} lit={alone} ids={ids} />
        </>
      )
    }
    case 'room':
      return (
        <>
          <Room ids={ids} floor={240} />
          <Hood x={60} y={40} w={250} />
          <g>
            <rect className="es-draw__steel-side" x={356} y={70} width={5} height={170} rx={2} />
            <rect className="es-draw__steel-side" x={429} y={70} width={5} height={170} rx={2} />
            {[0, 1, 2, 4, 5, 7].map((shelf) => (
              <rect key={shelf} className="es-draw__steel" x={362} y={226 - shelf * 18} width={66} height={7} rx={2} />
            ))}
            <ellipse className="es-draw__shadow" cx={395} cy={242} rx={48} ry={4} />
          </g>
        </>
      )
  }
}

export function KitchenDrawing({ subject, step, variant = 'twin' }: KitchenDrawingProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ids: Ids = { tile: `${id}-tile`, floor: `${id}-floor`, glow: `${id}-glow`, pool: `${id}-pool`, heat: `${id}-heat` }
  const info = SUBJECT_INFO[subject]
  const ticket = subject === 'assembled' || subject === 'rail' ? serviceAt(step).rail.at(-1) : undefined
  return (
    <svg
      className="es-draw"
      data-variant={variant}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${info.name}, drawn front on${ticket ? `; ticket ${ticket.no} is the newest on the rail` : ''}`}
      data-cell={ticket ? cellOf(ticket.no) : undefined}
    >
      <defs>
        <pattern id={ids.tile} width={24} height={12} patternUnits="userSpaceOnUse">
          <rect className="es-draw__grout" width={24} height={12} />
          <rect className="es-draw__tile-face" x={0.6} y={0.6} width={22.8} height={4.8} rx={1} />
          <rect className="es-draw__tile-face" x={-11.4} y={6.6} width={22.8} height={4.8} rx={1} />
          <rect className="es-draw__tile-face" x={12.6} y={6.6} width={22.8} height={4.8} rx={1} />
        </pattern>
        <pattern id={ids.floor} width={30} height={14} patternUnits="userSpaceOnUse">
          <rect className="es-draw__floor-joint" width={30} height={14} />
          <rect className="es-draw__floor-face" x={0.5} y={0.5} width={29} height={13} rx={1} />
        </pattern>
        <radialGradient id={ids.glow}>
          <stop className="es-draw__stop-lamp" offset="0" />
          <stop className="es-draw__stop-lamp-clear" offset="1" />
        </radialGradient>
        <radialGradient id={ids.pool}>
          <stop className="es-draw__stop-pool" offset="0" />
          <stop className="es-draw__stop-lamp-clear" offset="1" />
        </radialGradient>
        <linearGradient id={ids.heat} x1="0" y1="0" x2="0" y2="1">
          <stop className="es-draw__stop-pool" offset="0" />
          <stop className="es-draw__stop-lamp-clear" offset="1" />
        </linearGradient>
      </defs>
      {drawing(subject, step, ids)}
    </svg>
  )
}
