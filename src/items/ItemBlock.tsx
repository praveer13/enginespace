import { lazy, Suspense, useState, type ComponentProps } from 'react'
import type { CompiledBlock } from '@es/schema'
// By path, not through the package's index: the index brings the registry, and with it every family's code (D-059).
import { faceById } from '@es/play/items/catalog'
import { offeredAt } from '@es/play/items/draw'
import { isLevel, LEVEL_NAMES } from '@es/play/items/types'
import type { Gen, Level } from '@es/play/items/types'
import { Icon } from '@/design/components/Glyph'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { TicketLine } from '@/design/components/Ticket'
import { freshEntropy } from './answer'
import { useFamily } from './families'
import { Frame } from './Frame'

/*
 * The `item` block of a lesson (ARCHITECTURE §4.3, §8.2): `family`, `level` and `count` name a generator family, how far it is
 * faded, and how many items an attempt holds. This file is what a lesson page loads. It shows the ticket that waits for the
 * learner, and starts an attempt when they pull its stub: that is the moment the entropy is read, so that every attempt is on
 * seeds nobody drew before.
 *
 * The attempt itself (Attempt.tsx) is its own chunk. It brings the evidence ledger, which a page that only shows a ticket has no
 * use for, and the ledger is loaded when an attempt starts. So is the family's code: the waiting ticket is drawn from the family's face
 * (packages/play/items/catalog.ts), and what makes and grades an item loads with the attempt (src/items/families.ts, D-059).
 */

const Attempt = lazy(() => import('./Attempt'))

type AttemptOfProps = Omit<ComponentProps<typeof Attempt>, 'gen'> & { family: string; families?: readonly Gen[] }

/** An attempt at the family called `family`, once its code has loaded. Until then the Suspense boundary above shows the loading ticket. */
function AttemptOf({ family, families, ...rest }: AttemptOfProps) {
  const gen = useFamily(family, families)
  return <Attempt gen={gen} {...rest} />
}

type Of<Type extends CompiledBlock['type']> = Extract<CompiledBlock, { type: Type }>

export interface ItemBlockProps {
  block: Of<'item'>
  /** The lesson or module the block belongs to, for the foot line. */
  scope: string
  /** The families to draw from, whole. The catalog's faces, with each family's code loaded when an attempt starts, unless a test gives its own. */
  families?: readonly Gen[]
}

interface Run {
  /** Counts the attempts, so that a new one is a new component. */
  n: number
  entropy: readonly number[]
}

export function ItemBlock({ block, scope, families }: ItemBlockProps) {
  const [run, setRun] = useState<Run | null>(null)
  const gen = faceById(block.family, families)
  const level: Level | null = isLevel(block.level) ? block.level : null

  if (gen === undefined || level === null) {
    return (
      <Frame scope={scope} family={block.family} phase="unbuilt" stub={<Stub disabled>Start items</Stub>}>
        <p>
          This lesson draws {block.count} items from the family <code>{block.family}</code>, on fresh seeds when you start.
        </p>
        <p className="es-c-pending">
          <TicketLine tone="ink-2" qty={<Icon name="lock" className="es-c-pending__mark" />}>
            Not built yet: {level === null ? `level ${block.level}` : `the generator for ${block.family}`}
          </TicketLine>
        </p>
      </Frame>
    )
  }
  if (offeredAt(gen, level).length === 0) {
    return (
      <Frame scope={scope} family={block.family} phase="unbuilt" stub={<Stub disabled>Start items</Stub>}>
        <p>
          The family <code>{gen.id}</code> has no items at level {level} ({LEVEL_NAMES[level]}). The levels it offers are{' '}
          {gen.variants.flatMap((variant) => variant.levels).filter((offered, at, all) => all.indexOf(offered) === at).sort((a, b) => a - b).join(', ')}.
        </p>
      </Frame>
    )
  }

  const start = () => setRun((previous) => ({ n: (previous?.n ?? 0) + 1, entropy: freshEntropy(block.count) }))

  if (run === null) {
    // The KCs of the variants that this block can draw: a family that two lessons name at two levels (tr5a.blocks-held) assesses other KCs in each.
    const kcs = [...new Set(offeredAt(gen, level).flatMap((variant) => variant.kcs))]
    return (
      <Frame scope={scope} family={block.family} phase="idle" stub={<Stub onClick={start}>Start items</Stub>}>
        <p>
          {block.count} {block.count === 1 ? 'item' : 'items'} on fresh numbers, drawn when you start. Answer, say how sure you are, and read why. Nothing is timed.
        </p>
        <p className="es-c-line">
          <TicketLine qty={`${block.count}x`} note={`level ${level}`}>
            {gen.title}
          </TicketLine>
        </p>
        <ul className="es-c-tapes" aria-label="What these items assess">
          <TapeLabel as="li" size="sm" tilt="none">
            {LEVEL_NAMES[level]}
          </TapeLabel>
          {kcs.map((kc) => (
            <TapeLabel key={kc} as="li" size="sm" tilt="none">
              {kc}
            </TapeLabel>
          ))}
        </ul>
      </Frame>
    )
  }

  return (
    <Suspense fallback={<Frame scope={scope} family={block.family} phase="loading" state="loading" loadingLabel="Printing the items" />}>
      <AttemptOf key={run.n} family={gen.id} {...(families === undefined ? {} : { families })} level={level} entropy={run.entropy} scope={scope} onRestart={start} />
    </Suspense>
  )
}
