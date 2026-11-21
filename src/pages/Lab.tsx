import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '@/content/load'
import { labName, laneName, titled } from '@/content/render/model'
import { TextLink } from '@/design/components/TextLink'
import { Sheet } from '@/design/components/Sheet'
import { isForgeLab } from '@/forge/ids'
import { GRADED_LABS, SPECIMEN_IDS } from '@/labs/published'
import { printedId } from '@/map/summary'
import { labById } from '@/receipts/labs'
import { TEST_HOOKS } from '@/scene/test-hook'
import { LAB_HOLDS, LAB_LOCAL, LAB_STUBS, type LabStub } from '@/unbuilt/copy'
import { Unbuilt } from '@/unbuilt/Unbuilt'

/*
 * /labs/:lab (ARCHITECTURE §3.1). A forge lab takes a dropped .wasm and shows per-check results (W1-T10); its page, its host and its
 * oracle load together and only when this route is opened with a forge lab's id. A GPU or local lab with a descriptor in
 * src/labs/published.ts gets the graded lab's page (src/labs/GradedLabView.tsx: the kit, the inputs, a challenge per stage, the grader's
 * command, the receipt and the checks), which loads only when this route is opened with its id. A lab with neither says what its page will
 * hold (src/unbuilt/copy.ts). The dev server and a test build draw the graded page's specimen for the labs of `SPECIMEN_IDS`; a production
 * build cannot (the constant is fixed when the app is built).
 *
 * Every lab's page sets the title and, until it is built, the heading that its served document has (scripts/pages/plan.ts), so the tab
 * and the heading do not change when the app takes over (WCAG 2.4.2). A lab that the course does not have says so.
 */
/** `?stage=<first stage>` for a lab that issues challenges, so GPU lab results opens on it; nothing for a lab it does not list. */
const stageQuery = (lab: string): string => {
  const first = labById(lab)?.stages[0]
  return first === undefined ? '' : `?stage=${first.id}`
}
const ForgeLabPage = lazy(() => import('@/forge/ForgeLabPage'))
const GradedLabPage = lazy(() => import('@/labs/GradedLabPage'))

const SHOW_SPECIMEN = TEST_HOOKS || import.meta.env.MODE === 'development'
/** A lab of lane L or F whose page is the graded lab's. */
const isGradedLab = (id: string): boolean => Object.hasOwn(GRADED_LABS, id) || (SHOW_SPECIMEN && SPECIMEN_IDS.includes(id))

function LabStubPage({ id, stub }: { id: string; stub: LabStub }) {
  return (
    <Unbuilt
      title={labName(id)}
      lead={`${stub.handIn}.`}
      heading="What it will hold"
      holds={stub.lane === 'B' ? LAB_HOLDS.forge : LAB_HOLDS.graded}
      tapes={[`lane · ${laneName(stub.lane)}`, `module · ${printedId(stub.module)}`]}
    >
      <p>
        This lab belongs to <TextLink to={`/m/${stub.module}`}>{printedId(stub.module)}</TextLink>.
      </p>
      {stub.lane === 'B' ? null : (
        <p className="es-panel__lead" data-link="gpu-lab-results">
          {LAB_LOCAL.before}
          <TextLink to={`/receipts${stageQuery(id)}`}>{LAB_LOCAL.link}</TextLink>
          {LAB_LOCAL.after}
        </p>
      )}
    </Unbuilt>
  )
}

export function Component() {
  const { lab: labId = '' } = useParams()
  const forge = isForgeLab(labId)
  const graded = !forge && isGradedLab(labId)
  const stub = Object.hasOwn(LAB_STUBS, labId) ? LAB_STUBS[labId] : undefined
  useDocumentTitle(titled(forge || graded || stub !== undefined ? labName(labId) : 'Lab not found'))
  if (forge) {
    return (
      <Suspense fallback={<Sheet as="section" width="wide" head="The forge" state="loading" loadingLabel="Printing the lab" />}>
        <ForgeLabPage labId={labId} />
      </Suspense>
    )
  }
  if (graded) {
    return (
      <Suspense fallback={<Sheet as="section" width="wide" head="The lab" state="loading" loadingLabel="Loading the lab" />}>
        <GradedLabPage labId={labId} />
      </Suspense>
    )
  }
  if (stub !== undefined) return <LabStubPage id={labId} stub={stub} />
  return (
    <>
      <h1>Lab not found</h1>
      <p>
        No lab is called &quot;{labId}&quot;. See <Link to="/map">the course map</Link>.
      </p>
    </>
  )
}
