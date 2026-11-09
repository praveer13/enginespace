import { useIndex } from '@/content/load'
import { useMap } from '@/content/load-map'
import { PageNotice } from '@/content/render/Page'
import { CourseMapView } from '@/map/CourseMap'
import { MAP } from '@/map/copy'
import { useProgress } from '@/progress/useProgress'

/*
 * `/map` (ARCHITECTURE §3.1): the course map, TR0 to the capstone, with the lanes, hours, kernelspace lessons and artifacts of each
 * module and what the learner holds of it. The page reads the course index and the compiled map, opens the ledger through
 * `useProgress`, and hands what they say to `CourseMapView`, which draws it (src/map). Nothing about the learner is stored: the
 * progress is derived from their events each time the page draws (src/progress).
 */
export function Component() {
  const index = useIndex()
  const map = useMap()
  const { ready, progress } = useProgress(map.status === 'ready' ? map.value : null)

  if (index.status === 'error' || map.status === 'error') {
    return <PageNotice kind="failed" title={MAP.notice.failedTitle} ticket="map" message={MAP.notice.failedMessage} />
  }
  if (index.status === 'loading' || map.status === 'loading') {
    return <PageNotice kind="loading" title={MAP.notice.loadingTitle} ticket="map" what={MAP.notice.loadingWhat} />
  }
  return <CourseMapView modules={index.value.modules} totalHours={index.value.totalHours} map={map.value} progress={progress} ready={ready} />
}
