import * as Dialog from '@radix-ui/react-dialog'
import { Fragment, type ReactNode } from 'react'
import { COMMON_KEYS } from '@es/play'
import type { KeyBinding } from '@es/play'
import { Button } from '@/design/components/Button'
import { Ticket } from '@/design/components/Ticket'

/*
 * The help dialog (ARCHITECTURE §6.8): every key the game answers to, the ones common to every game and then the game's own.
 * It is a Radix dialog, so it traps focus, closes on Escape and gives focus back to whatever opened it: the Keys button, or
 * the place the learner was when they pressed `?`. The list sits on a ticket, the surface read text is printed on (D-047).
 */

/** The keys as a list: the key cap, then what it does. Exported for the tests, which cannot open a portal. */
export function KeysList({ keys }: { keys: readonly KeyBinding[] }) {
  const common = new Set(COMMON_KEYS.map((key) => key.id))
  const groups: { title: string; keys: KeyBinding[] }[] = [
    { title: 'In every game', keys: keys.filter((key) => common.has(key.id)) },
    { title: 'In this game', keys: keys.filter((key) => !common.has(key.id)) },
  ]
  return (
    <>
      {groups
        .filter((group) => group.keys.length > 0)
        .map((group) => (
          <section key={group.title} aria-label={group.title} className="mt-4">
            <h3 className="font-bold text-text-1">{group.title}</h3>
            <dl className="mt-2 grid grid-cols-[minmax(5rem,auto)_1fr] items-baseline gap-x-4 gap-y-2" data-keys={group.title === 'In every game' ? 'common' : 'own'}>
              {group.keys.map((key) => (
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
    </>
  )
}

export interface KeysDialogProps {
  /** The game's whole map: `keymapOf(entry)`. */
  keys: readonly KeyBinding[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The button that opens it. */
  children: ReactNode
}

export function KeysDialog({ keys, open, onOpenChange, children }: KeysDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-3 opacity-70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
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
              Keys work while focus is inside the game. A key is left alone where the focused control uses it itself, such as Space on a button.
            </Dialog.Description>
            <KeysList keys={keys} />
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
