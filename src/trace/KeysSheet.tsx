import * as Dialog from '@radix-ui/react-dialog'
import { Fragment, useRef } from 'react'
import type { KeyBinding } from '@es/play'
import { Button } from '@/design/components/Button'
import { Ticket } from '@/design/components/Ticket'
import { KEY_GROUPS } from './keys'

/*
 * The help dialog (ARCHITECTURE §6.8): every key the tape answers to, in the groups a learner thinks in. It is a Radix dialog, so it
 * traps focus and closes on Escape, and it gives focus back to whatever had it. It is the kit's help dialog in shape and says "tape"
 * where the kit's says "game", because the viewer is not always inside a game.
 */

export interface KeysSheetProps {
  keys: readonly KeyBinding[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeysSheet({ keys, open, onOpenChange }: KeysSheetProps) {
  const opener = useRef<HTMLElement | null>(null)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-3 opacity-70" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
          onOpenAutoFocus={() => {
            const active = document.activeElement
            opener.current = active instanceof HTMLElement && active !== document.body ? active : null
          }}
          onCloseAutoFocus={(event) => {
            const back = opener.current
            opener.current = null
            if (back === null || !back.isConnected) return
            event.preventDefault()
            back.focus({ preventScroll: true })
          }}
        >
          <Ticket
            as="div"
            width="full"
            hole={false}
            head="Keys"
            title={
              <Dialog.Title asChild>
                <span>Keyboard</span>
              </Dialog.Title>
            }
            titleAs="h2"
          >
            <Dialog.Description>
              Keys work while focus is inside the tape. A key is left alone where the focused control uses it itself: every key in the label field, and Space and Enter on a button.
            </Dialog.Description>
            {KEY_GROUPS.map((group) => (
              <section key={group.title} aria-label={group.title} className="mt-4">
                <h3 className="font-bold text-text-1">{group.title}</h3>
                <dl className="mt-2 grid grid-cols-[6.75rem_1fr] items-baseline gap-x-4 gap-y-2" data-keys={group.title}>
                  {group.ids
                    .map((id) => keys.find((key) => key.id === id))
                    .filter((key): key is KeyBinding => key !== undefined)
                    .map((key) => (
                      <Fragment key={key.id}>
                        <dt>
                          <kbd className="inline-block min-w-8 rounded-plate border border-edge bg-surface-1 px-2 text-center">{key.label}</kbd>
                        </dt>
                        <dd>{key.description}</dd>
                      </Fragment>
                    ))}
                </dl>
              </section>
            ))}
            <section aria-label="In the table of spans" className="mt-4">
              <h3 className="font-bold text-text-1">In the table of spans</h3>
              <dl className="mt-2 grid grid-cols-[6.75rem_1fr] items-baseline gap-x-4 gap-y-2" data-keys="table">
                {[
                  ['Up, Down', 'Move to the previous or the next span: the cursor goes with focus'],
                  ['Home, End', 'Go to the first or the last span'],
                  ['Page Up, Page Down', 'Go to the previous or the next lane'],
                ].map(([cap, what]) => (
                  <Fragment key={cap}>
                    <dt>
                      <kbd className="inline-block min-w-8 rounded-plate border border-edge bg-surface-1 px-2 text-center">{cap}</kbd>
                    </dt>
                    <dd>{what}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
            <div className="mt-6 flex justify-end">
              <Dialog.Close asChild>
                <Button variant="ink">Close</Button>
              </Dialog.Close>
            </div>
          </Ticket>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
