import { TEST_HOOKS } from '@/scene/test-hook'
import { GradedLabView } from './GradedLabView'
import { useKitFiles } from './kit-files'
import { GRADED_LABS } from './published'
import { SPECIMENS } from './specimen'
import type { GradedLab } from './types'
import '@/pages/panels.css'
import './labs.css'

/*
 * A graded lab's page, once its code has loaded (src/pages/Lab.tsx loads this file lazily, as it loads a forge lab's): the lab's descriptor
 * (published.ts), and what the site's list of files says of each file its kit links (kit-files.ts), drawn by GradedLabView.tsx.
 *
 * The dev server and a test build draw the specimen (specimen.ts) for a lab that is not published yet. The constant is fixed when the app is
 * built, so a production build holds no specimen.
 */
const SHOW_SPECIMEN = TEST_HOOKS || import.meta.env.MODE === 'development'

/** The descriptor of a lab's page: the published one, or in a dev or test build its specimen. */
function gradedLabOf(id: string): GradedLab | undefined {
  if (Object.hasOwn(GRADED_LABS, id)) return GRADED_LABS[id]
  return SHOW_SPECIMEN && Object.hasOwn(SPECIMENS, id) ? SPECIMENS[id] : undefined
}

export default function GradedLabPage({ labId }: { labId: string }) {
  const lab = gradedLabOf(labId)
  const files = useKitFiles(lab?.kit ?? [])
  return lab === undefined ? null : <GradedLabView lab={lab} files={files} />
}
