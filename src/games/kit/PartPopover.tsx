import { lazy, Suspense, type ReactNode } from 'react'
import { Popover } from '@/design/components/Popover'
import './part-popover.css'

/*
 * Touch a part, get its source (REDESIGN §2.6): selecting a part of a diagram (a page, a queue, a stage) opens a popover with the part's
 * engine name (as code when it is an identifier), its one sentence, its value with its tag, and the file and symbol at the pinned commit as
 * a link out. A part the engine has no source for says "model object". The rows are the game's parts table (packages/play/<game>/copy.ts),
 * the same rows its parts list reads, so the two can never name a part two ways.
 *
 * Like every popover it opens on activation, never on focus alone, closes on Escape, on its Close button or a press outside, and hands
 * focus back to its trigger. Its source (the claim's value, tag and link) is a lazy chunk, PartSource.tsx, loaded the first time a popover
 * opens, and it reads the course's claims file only then.
 */

const PartSource = lazy(() => import('./PartSource'))

/** A row of a game's parts table, as the popover reads it. */
export interface SourcedPart {
  readonly id: string
  /** The engine's name for the part. */
  readonly name: string
  /** Set the name as code: it is an identifier, spelled as the pinned source spells it. */
  readonly code?: boolean
  readonly sentence: ReactNode
  /** The class or function the pinned engine names it by, set as code. */
  readonly engine?: string
  /** The claim that sources it (content/claims). None: a model object. */
  readonly claim?: string
}

/** What the popover says of a part that has no claim: the course's model draws it, and no engine file holds it. */
export const MODEL_OBJECT = 'Model object: the course’s model draws it, and no file in the engine holds it as such.'

export interface PartPopoverProps {
  part: SourcedPart
  /** What the trigger shows: the part's name, by default. */
  trigger?: ReactNode
  /** The trigger's accessible name, when its visible words need more. */
  triggerLabel?: string
  /** What this one object adds to its row: a page's owner and state. */
  detail?: ReactNode
  /** The engine line in words, where the row's own would read wrong for this object. */
  engineLine?: ReactNode
  variant?: 'button' | 'quiet'
  inline?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export function PartPopover({ part, trigger, triggerLabel, detail, engineLine, variant = 'quiet', inline = true, open, onOpenChange, className }: PartPopoverProps) {
  const Part = inline ? 'span' : 'div'
  const name = part.code ? <code>{part.name}</code> : part.name
  const engine =
    engineLine ??
    (part.engine === undefined ? null : (
      <>
        In vLLM: <code>{part.engine}</code>.
      </>
    ))
  return (
    <Popover
      variant={variant}
      inline={inline}
      trigger={trigger ?? name}
      triggerLabel={triggerLabel}
      title={name}
      open={open}
      onOpenChange={onOpenChange}
      className={className === undefined ? 'es-partpop' : `es-partpop ${className}`}
      triggerData={{ 'data-part': part.id }}
    >
      <Part className="es-partpop__sentence">{part.sentence}</Part>
      {engine === null ? null : <Part className="es-partpop__engine">{engine}</Part>}
      {detail === undefined ? null : <Part className="es-partpop__detail">{detail}</Part>}
      {part.claim === undefined ? (
        <Part className="es-partpop__model" data-model-object="">
          {MODEL_OBJECT}
        </Part>
      ) : (
        <Suspense fallback={<Part className="es-partpop__loading">Reading the source…</Part>}>
          <PartSource claim={part.claim} inline={inline} />
        </Suspense>
      )}
    </Popover>
  )
}
