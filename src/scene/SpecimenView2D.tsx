import type { MouseEvent } from 'react'
import type { SpecimenLayout } from './specimen-layout'

/*
 * The specimen's 2D twin (ARCHITECTURE §6.2: a first-class path, never a degraded one): the same layout as the 3D pass,
 * drawn as an SVG Gantt. Time runs left to right with the present at the right, the expo's lane above the line, one row of
 * places per clip on each fire, dark stretches as dashed outlines, and the rail at the present. The same forms carry the
 * same states: a plate is solid, an empty place an inset groove, a binned plate hollow. Text is SVG text, so it is real
 * text; colours are the roles, through the classes in scene.css.
 */

export interface SpecimenView2DProps {
  layout: SpecimenLayout
  selected: string | null
  onPick?: (fireId: string) => void
}

const W = 640
const H = 360
const LEFT = 104
const RIGHT = 576
const CPU = { top: 52, height: 30 }
const GPU = { top: 108, height: 120 }
const AXIS = 252

export function SpecimenView2D({ layout, selected, onPick }: SpecimenView2DProps) {
  const { window, settings } = layout
  const span = Math.max(1, window.now - window.start)
  const x = (t: number) => LEFT + ((t - window.start) / span) * (RIGHT - LEFT)
  const clips = settings.clips
  const row = GPU.height / clips
  const dense = clips > 8
  const pick = (id: string) => (event: MouseEvent) => {
    event.preventDefault()
    onPick?.(id)
  }
  const fireOf = new Map(layout.fires.map((fire) => [fire.index, fire]))

  return (
    <svg className="es-twin" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`2D view: ${layout.fires.length} fires on the line, the latest ending at tick ${window.now} (synthetic)`}>
      <rect className="es-twin__ground" x="0" y="0" width={W} height={H} rx="6" />

      <text className="es-twin__lane-name" x={LEFT - 12} y={CPU.top + CPU.height / 2 + 5} textAnchor="end">
        the expo
      </text>
      <text className="es-twin__lane-term" x={LEFT - 12} y={CPU.top + CPU.height / 2 + 21} textAnchor="end">
        cpu
      </text>
      <text className="es-twin__lane-name" x={LEFT - 12} y={GPU.top + GPU.height / 2 - 3} textAnchor="end">
        the line
      </text>
      <text className="es-twin__lane-term" x={LEFT - 12} y={GPU.top + GPU.height / 2 + 13} textAnchor="end">
        gpu
      </text>

      <rect className="es-twin__bed" x={LEFT} y={CPU.top - 4} width={RIGHT - LEFT} height={CPU.height + 8} />
      <rect className="es-twin__bed" x={LEFT} y={GPU.top - 4} width={RIGHT - LEFT} height={GPU.height + 8} />

      {layout.spans.map((mark) => {
        const x0 = Math.max(LEFT, x(mark.start))
        const x1 = Math.min(RIGHT, x(mark.end))
        if (x1 <= x0) return null
        if (mark.role === 'lane-cpu') {
          const plan = mark.height > 0.04
          const h = plan ? CPU.height : CPU.height / 2
          return <rect key={mark.id} className="es-twin__cpu" data-phase={plan ? 'plan' : 'read'} x={x0} y={CPU.top + CPU.height - h} width={x1 - x0} height={h} />
        }
        if (mark.form === 'hollow') return <rect key={mark.id} className="es-twin__dark" x={x0 + 1} y={GPU.top + 1} width={Math.max(0, x1 - x0 - 2)} height={GPU.height - 2} />
        const index = Number(mark.id.replace('fire-', ''))
        const fire = fireOf.get(index)
        return (
          <g key={mark.id} className="es-twin__fire" data-selected={selected === mark.id || undefined} onClick={onPick ? pick(mark.id) : undefined}>
            <rect className="es-twin__slab" x={x0} y={GPU.top} width={x1 - x0} height={GPU.height} />
            {fire && !dense
              ? Array.from({ length: clips }, (_, slot) => {
                  const form = slot < fire.plates ? 'plate' : slot < fire.plates + fire.binned ? 'binned' : 'empty'
                  const inset = Math.min(4, (x1 - x0) / 6)
                  return <rect key={slot} className="es-twin__place" data-form={form} x={x0 + inset} y={GPU.top + slot * row + 4} width={Math.max(1, x1 - x0 - 2 * inset)} height={row - 8} rx="2" />
                })
              : null}
            {fire && dense ? <rect className="es-twin__density" x={x0} y={GPU.top + GPU.height * (1 - (fire.plates + fire.binned) / clips)} width={x1 - x0} height={(GPU.height * (fire.plates + fire.binned)) / clips} /> : null}
          </g>
        )
      })}

      {layout.fires
        .filter((fire) => fire.id === selected)
        .map((fire) => (
          <rect key="selected" className="es-twin__selected" x={x(fire.start) - 3} y={GPU.top - 7} width={Math.max(6, x(fire.end) - x(fire.start) + 6)} height={GPU.height + 14} rx="3" />
        ))}

      <line className="es-twin__axis" x1={LEFT} x2={RIGHT} y1={AXIS} y2={AXIS} />
      {layout.anchors
        .filter((anchor) => anchor.kind === 'tick')
        .map((anchor) => {
          const t = Number(anchor.text)
          return (
            <g key={anchor.id}>
              <line className="es-twin__tick" x1={x(t)} x2={x(t)} y1={AXIS} y2={AXIS + 6} />
              <text className="es-twin__tick-label" x={x(t)} y={AXIS + 22} textAnchor="middle">
                {anchor.text}
              </text>
            </g>
          )
        })}
      <text className="es-twin__axis-name" x={RIGHT} y={AXIS + 44} textAnchor="end">
        the clock · ticks, synthetic
      </text>

      <line className="es-twin__present" x1={RIGHT + 0.5} x2={RIGHT + 0.5} y1={CPU.top - 16} y2={GPU.top + GPU.height + 10} />
      <text className="es-twin__present-name" x={RIGHT + 8} y={CPU.top - 6}>
        now
      </text>

      <g className="es-twin__legend" transform={`translate(${LEFT}, ${H - 34})`}>
        {(['plate', 'empty', 'binned'] as const).map((form, i) => (
          <g key={form} transform={`translate(${i * 108}, 0)`}>
            <rect className="es-twin__place" data-form={form} x="0" y="0" width="22" height="14" rx="2" />
            <text className="es-twin__legend-label" x="30" y="12">
              {form}
            </text>
          </g>
        ))}
        <g transform="translate(324, 0)">
          <rect className="es-twin__dark" x="0" y="0" width="22" height="14" />
          <text className="es-twin__legend-label" x="30" y="12">
            dark
          </text>
        </g>
      </g>
    </svg>
  )
}
