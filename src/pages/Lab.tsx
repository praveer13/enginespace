import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router'
import { useDocumentTitle } from '@/content/load'
import { LAB_TASKS, labName, laneName, titled } from '@/content/render/model'
import { TextLink } from '@/design/components/TextLink'
import { Ticket } from '@/design/components/Ticket'
import { isForgeLab } from '@/forge/ids'
import { printedId } from '@/map/summary'
import { labById } from '@/receipts/labs'
import { LAB_HOLDS, LAB_STUBS, type LabStub } from '@/unbuilt/copy'
import { Unbuilt } from '@/unbuilt/Unbuilt'

/*
 * /labs/:lab (ARCHITECTURE §3.1). A forge lab takes a dropped .wasm and shows per-check results (W1-T10); its page, its host and its
 * oracle load together and only when this route is opened with a forge lab's id. A GPU or local lab offers the kit, a challenge and
 * the receipt import, which wave 2 builds: until then its page says what it will hold and which task builds it (src/unbuilt/copy.ts).
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

function LabStubPage({ id, stub }: { id: string; stub: LabStub }) {
  return (
    <Unbuilt
      title={labName(id)}
      lead={`${stub.handIn}.`}
      heading="What it will hold"
      holds={stub.lane === 'B' ? LAB_HOLDS.forge : LAB_HOLDS.graded}
      tasks={[LAB_TASKS[id]]}
      next={{ to: `/m/${stub.module}`, label: `Open ${printedId(stub.module)}` }}
      tapes={[`lane · ${laneName(stub.lane)}`, `module · ${printedId(stub.module)}`]}
    >
      {stub.lane === 'B' ? null : (
        <p className="es-panel__lead" data-link="gpu-lab-results">
          This lab runs on your own machine. Get its challenge and bring its receipt file back on <TextLink to={`/receipts${stageQuery(id)}`}>GPU lab results</TextLink>.
        </p>
      )}
    </Unbuilt>
  )
}

export function Component() {
  const { lab: labId = '' } = useParams()
  const forge = isForgeLab(labId)
  const stub = Object.hasOwn(LAB_STUBS, labId) ? LAB_STUBS[labId] : undefined
  useDocumentTitle(titled(forge || stub !== undefined ? labName(labId) : 'Lab not found'))
  if (forge) {
    return (
      <Suspense fallback={<Ticket as="section" width="wide" head="The forge" state="loading" loadingLabel="Printing the lab" />}>
        <ForgeLabPage labId={labId} />
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
