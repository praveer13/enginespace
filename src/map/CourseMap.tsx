import { useId } from 'react'
import type { CourseMap, IndexModule } from '@es/schema'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TextLink } from '@/design/components/TextLink'
import { nextModule, type Progress } from '@/progress/derive'
import { MAP } from './copy'
import { Stop } from './Stop'
import { decimalsOf, LANE_ORDER, laneTotals, printedId } from './summary'
import './map.css'

/*
 * The course map (`/map`; ARCHITECTURE §3.1, TRACKER W1-T06): the menu, opened out. Under the page's heading and the printer's tape of
 * the course so far, every module hangs on the rail in the order a learner meets them, one ticket each, in rows of as many as the page
 * is wide. The tickets are an ordered list, so a reader who cannot see the rail gets the course in its order, each ticket with its
 * facts and one link to its module; the rail, the clips and the pips are drawn on top of that list and add nothing it lacks.
 *
 * The page takes everything it shows as props: the course index, the compiled map, and the progress derived from the ledger. It reads
 * no store, and what it shows of the learner is a function of their events and the course (src/progress). `Map.tsx` is the route.
 */

export interface CourseMapViewProps {
  modules: readonly IndexModule[]
  totalHours: number
  map: CourseMap
  /** What the ledger holds, derived. Null until the map is there to read it against. */
  progress: Progress | null
  /** True once the ledger has been read. Until then the page says so, and does not say the learner has done nothing. */
  ready: boolean
}

function Tape({ modules, totalHours, progress, ready, next }: Pick<CourseMapViewProps, 'modules' | 'totalHours' | 'progress' | 'ready'> & { next: string | null }) {
  const totals = laneTotals(modules)
  const counts = progress?.counts
  const reading = ready && counts !== undefined
  const lines: PrinterTapeLine[] = [
    { id: 'hours', label: MAP.tape.hours, value: <Readout value={totalHours} digits={decimalsOf(totalHours)} tag="derived" size="sm" /> },
    ...LANE_ORDER.filter((lane) => totals[lane] > 0).map(
      (lane): PrinterTapeLine => ({
        id: `lane-${lane}`,
        label: MAP.tape.lanes[lane],
        value: <Readout value={totals[lane]} digits={decimalsOf(totals[lane])} tag="derived" size="sm" />,
      }),
    ),
    {
      id: 'earned',
      label: MAP.tape.earned,
      value: reading ? (
        <>
          <Readout value={counts.earned} tag="measured" size="sm" /> {MAP.tape.of} {counts.total}
        </>
      ) : (
        MAP.tape.reading
      ),
    },
    {
      id: 'kept',
      label: MAP.tape.kept,
      value: reading ? <Readout value={counts.kept} tag="measured" size="sm" /> : MAP.tape.reading,
    },
    {
      id: 'next',
      label: MAP.tape.next,
      value: !ready ? MAP.tape.reading : next === null ? MAP.tape.none : <TextLink to={`/m/${next}`}>{printedId(next)}</TextLink>,
    },
  ]
  return <PrinterTape label={MAP.tape.name} lines={lines} className="es-map__tape" />
}

export function CourseMapView({ modules, totalHours, map, progress, ready }: CourseMapViewProps) {
  const listId = useId()
  // The lamp waits for the ledger: a learner who has earned a module would see it light the wrong ticket for a moment.
  const next = ready && progress !== null ? nextModule(modules, progress) : null
  const details = new Map(map.modules.map((module) => [module.id, module]))
  return (
    <div className="es-map" data-page="map">
      <header className="es-map__header">
        <div className="es-map__intro">
          <div className="es-map__heading">
            <h1 className="es-map__title">{MAP.title}</h1>
            <TapeLabel tilt="left" className="es-map__term">
              {MAP.term}
            </TapeLabel>
          </div>
          {MAP.lede.map((line) => (
            <p key={line} className="es-map__lede">
              {line}
            </p>
          ))}
        </div>
        <Tape modules={modules} totalHours={totalHours} progress={progress} ready={ready} next={next} />
      </header>
      <section aria-labelledby={listId} className="es-map__course">
        <h2 id={listId} className="sr-only">
          {MAP.modules}
        </h2>
        <ol className="es-map__rails">
          {modules.map((module) => (
            <Stop key={module.id} module={module} detail={details.get(module.id)} progress={progress?.modules.get(module.id)} ready={ready} next={module.id === next} />
          ))}
        </ol>
      </section>
    </div>
  )
}
