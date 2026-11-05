import { PAGE_LEAD } from '@/items/today/copy'
import { TodayView } from '@/items/today/TodayView'
import './panels.css'

/*
 * /today (ARCHITECTURE §3.1): Keep, the spaced review of the knowledge components earned so far (D-037; ASSESSMENT §8). The page is a title
 * and the view of src/items/today, which reads the ledger, derives the deck and works through a prep list one ticket at a time.
 */
export function Component() {
  return (
    <div className="es-page" data-page="today">
      <header className="es-page__header">
        <h1 className="es-page__title">Today</h1>
        <p className="es-page__lead">{PAGE_LEAD}</p>
      </header>
      <TodayView />
    </div>
  )
}
