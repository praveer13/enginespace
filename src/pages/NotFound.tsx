import { ContinueLink } from '@/design/components/Board'
import { usePointer } from '@/settings/usePlace'

/*
 * Statically imported by the route table: ARCHITECTURE §3.1 keeps the not-found page in the entry chunk. It says what happened in one sentence
 * and offers the way on, which is Continue (REDESIGN 2.4): the same answer the header gives, read from the pointer, so the page opens no ledger.
 */
export function Component() {
  const pointer = usePointer()
  return (
    <div className="grid justify-items-start gap-4 pt-4">
      <h1>Page not found</h1>
      <p>Nothing lives at this address.</p>
      <ContinueLink target={pointer} emphasis="primary" />
    </div>
  )
}
