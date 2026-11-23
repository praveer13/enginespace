import { useIndex } from '@/content/load'
import { useMap } from '@/content/load-map'
import { PageNotice } from '@/content/render/Page'
import { CourseMapView } from '@/map/CourseMap'
import { MAP } from '@/map/copy'
import { useEvidence } from '@/evidence/useEvidence'
import { useDue } from '@/map/due'
import { useProgress } from '@/progress/useProgress'

/*
 * `/map` (ARCHITECTURE §3.1), shown as Course: the modules from TR0 to the capstone in one column, with what each needs and where the
 * learner stands. The page reads the course index and the compiled map, opens the ledger through `useProgress`, and hands what they say
 * to `CourseMapView`, which draws it (src/map). Nothing about the learner is stored: the progress is derived from their events each
 * time the page draws (src/progress).
 */
export function Component() {
  const index = useIndex()
  const map = useMap()
  const { ready, progress, next, last, lessons } = useProgress(map.status === 'ready' ? map.value : null)
  const { events } = useEvidence()
  const due = useDue(events, ready, map.status === 'ready' ? map.value.refs : undefined)

  if (index.status === 'error' || map.status === 'error') {
    return <PageNotice kind="failed" title={MAP.notice.failedTitle} ticket="course" message={MAP.notice.failedMessage} />
  }
  if (index.status === 'loading' || map.status === 'loading') {
    return <PageNotice kind="loading" title={MAP.notice.loadingTitle} ticket="course" what={MAP.notice.loadingWhat} />
  }
  return <CourseMapView modules={index.value.modules} map={map.value} progress={progress} ready={ready} step={next} last={last} states={lessons} due={due} />
}
