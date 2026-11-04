import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { Ticket } from '@/design/components/Ticket'
import { isForgeLab } from '@/forge/ids'

/*
 * /labs/:lab (ARCHITECTURE §3.1). A forge lab takes a dropped .wasm and shows per-check results (W1-T10); its page, its host and its
 * oracle load together and only when this route is opened with a forge lab's id. A GPU or local lab offers the kit, a challenge and
 * the receipt import, which wave 2 builds.
 */
const ForgeLabPage = lazy(() => import('@/forge/ForgeLabPage'))

export function Component() {
  const { lab: labId } = useParams()
  if (isForgeLab(labId)) {
    return (
      <Suspense fallback={<Ticket as="section" width="wide" head="The forge" state="loading" loadingLabel="Printing the lab" />}>
        <ForgeLabPage labId={labId} />
      </Suspense>
    )
  }
  return (
    <>
      <h1>Lab</h1>
      <p>Lab id: {labId}</p>
      <p>This page is not built yet.</p>
    </>
  )
}
