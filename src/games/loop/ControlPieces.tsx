import clsx from 'clsx'
import type { ReactNode } from 'react'
import { requestName } from '@es/play/loop/copy'
import { Bell } from '@/design/components/Bell'
import { Button } from '@/design/components/Button'
import { Sheet, SheetLine } from '@/design/components/Sheet'
import type { LoopControls } from './useLoopControls'

/*
 * The pieces of the step loop's controls that every level has: the prompt, the waiting requests, Step and Auto (Controls.tsx says how
 * they behave, useLoopControls.ts holds their state). The overlap switch, which only the later levels have, is LoopOverlap.tsx, so a
 * page that opens on the first level (the front page) can load it when it is wanted.
 */

/** The level's prompt: what to do now, in the engine's words. */
export function LoopPrompt({ controls, className }: { controls: LoopControls; className?: string }) {
  return (
    <p className={clsx('es-type-body max-w-prose', className)} data-loop-prompt="">
      {controls.view.prompt}
    </p>
  )
}

/**
 * The waiting requests, as buttons that admit them into a batch slot. `limit` draws only the first few, as a printer's strip shows what it
 * has fed and keeps the rest inside; the keys `1` to `9` still reach every request in line, and the strip feeds the next as one is admitted.
 */
export function LoopTickets({
  controls,
  limit,
  className,
  listClassName = 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3',
  children,
}: {
  controls: LoopControls
  limit?: number
  className?: string
  listClassName?: string
  /** Drawn after the hint, inside the group: what is still waiting behind the strip. */
  children?: ReactNode
}) {
  const { view, list, onListKey, tabStop, hang, hint } = controls
  const shown = limit === undefined ? view.waiting : view.waiting.slice(0, limit)
  return (
    <section aria-label="Waiting requests" className={clsx('flex flex-col gap-2', className)} data-loop-controls="" data-waiting={view.waiting.length}>
      {shown.length > 0 ? (
        <ul ref={list} onKeyDown={onListKey} data-native-keys="arrows" className={listClassName}>
          {shown.map((id, index) => (
            <li key={id} className="min-w-0">
              <Sheet
                as="button"
                compact
                hole={false}
                width="full"
                head={requestName(id)}
                state={view.canHang ? 'default' : 'disabled'}
                tabIndex={index === tabStop ? 0 : -1}
                aria-label={`Admit request ${requestName(id)} into a batch slot`}
                onClick={() => hang(id, index)}
              >
                <SheetLine>admit</SheetLine>
              </Sheet>
            </li>
          ))}
        </ul>
      ) : null}
      {hint ? <p className="text-text-2">{hint}</p> : null}
      {children}
    </section>
  )
}

/** The Step control: it runs the next step. */
export function LoopBell({ controls, size = 'lg', caption = 'Step' }: { controls: LoopControls; size?: 'md' | 'lg'; caption?: ReactNode }) {
  const { view, bell, ring } = controls
  return (
    <div ref={bell}>
      <Bell step={view.step} onRing={ring} disabled={!view.canFire} size={size} caption={caption} ringLabel="Step: run the next step" />
    </div>
  )
}

/** Auto: runs steps until the loop needs a decision. A switch that turns itself off; Space works it. */
export function LoopAuto({ controls, size = 'lg' }: { controls: LoopControls; size?: 'sm' | 'md' | 'lg' }) {
  const { view, auto, toggleAuto } = controls
  return (
    <Button size={size} variant="plate" aria-pressed={auto} aria-keyshortcuts="Space" disabled={!view.canFire && !auto} onClick={toggleAuto}>
      Auto
    </Button>
  )
}
