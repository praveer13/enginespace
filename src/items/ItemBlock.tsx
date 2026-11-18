import { lazy, Suspense, useState, type ComponentProps } from 'react'
import type { CompiledBlock } from '@es/schema'
// By path, not through the package's index: the index brings the registry, and with it every family's code (D-059).
import { faceById } from '@es/play/items/catalog'
import { offeredAt } from '@es/play/items/draw'
import { isLevel, LEVEL_NAMES } from '@es/play/items/types'
import type { Gen, Level } from '@es/play/items/types'
import { Icon } from '@/design/components/Glyph'
import { Button } from '@/design/components/Button'
import { PrimaryButton } from '@/design/components/PrimaryButton'
import { SheetLine } from '@/design/components/Sheet'
import { freshEntropy } from './answer'
import { useFamily } from './families'
import { Frame } from './Frame'

/*
 * The `item` block of a lesson (ARCHITECTURE §4.3, §8.2): `family`, `level` and `count` name a generator family, how far it is
 * faded, and how many questions a set holds. This file is what a lesson page loads. It shows the sheet that waits for the
 * learner, and starts a set when they press Start questions: that is the moment the entropy is read, so that every set is on
 * seeds nobody drew before.
 *
 * The set itself (Attempt.tsx) is its own chunk. It brings the evidence ledger, which a page that only shows the waiting sheet has no
 * use for, and the ledger is loaded when a set starts. So is the family's code: the waiting sheet is drawn from the family's face
 * (packages/play/items/catalog.ts), and what makes and grades a question loads with the set (src/items/families.ts, D-059).
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
  /**
   * Another control is the move in hand (a checkpoint in Read, whose part has its way on; the Test's second set, under the first): this
   * block's Start is an outline, so that one amber control stands in the viewport. The set it starts is the same.
   */
  quiet?: boolean
  /** A practice set in Read: every control of the set is an outline, not only its Start, since the part's way on is the amber one. */
  practice?: boolean
  /** The way on after a passing set (the lesson's Test): the result's amber control. */
  onward?: { href: string; label: string } | null
  /** The families to draw from, whole. The catalog's faces, with each family's code loaded when an attempt starts, unless a test gives its own. */
  families?: readonly Gen[]
}

interface Run {
  /** Counts the attempts, so that a new one is a new component. */
  n: number
  entropy: readonly number[]
}

export function ItemBlock({ block, scope, families, quiet = false, practice = false, onward = null }: ItemBlockProps) {
  const [run, setRun] = useState<Run | null>(null)
  const gen = faceById(block.family, families)
  const level: Level | null = isLevel(block.level) ? block.level : null

  if (gen === undefined || level === null) {
    return (
      <Frame scope={scope} family={block.family} phase="unbuilt" stub={<PrimaryButton disabled>Start questions</PrimaryButton>}>
        <p className="es-c-pending">
          <SheetLine tone="ink-2" qty={<Icon name="lock" className="es-c-pending__mark" />}>
            These questions are not published yet.
          </SheetLine>
        </p>
      </Frame>
    )
  }
  if (offeredAt(gen, level).length === 0) {
    return (
      <Frame scope={scope} family={block.family} phase="unbuilt" stub={<PrimaryButton disabled>Start questions</PrimaryButton>}>
        <p className="es-c-pending">
          <SheetLine tone="ink-2" qty={<Icon name="lock" className="es-c-pending__mark" />}>
            There are no {LEVEL_NAMES[level]} questions on this topic yet.
          </SheetLine>
        </p>
      </Frame>
    )
  }

  const start = () => setRun((previous) => ({ n: (previous?.n ?? 0) + 1, entropy: freshEntropy(block.count) }))

  if (run === null) {
    return (
      <Frame scope={scope} family={block.family} phase="idle" stub={quiet ? <Button onClick={start}>Start questions</Button> : <PrimaryButton onClick={start}>Start questions</PrimaryButton>}>
        <p>
          {block.count} {block.count === 1 ? 'question' : 'questions'} on fresh numbers, drawn when you start. Answer, say how sure you are, and read why. Nothing is timed.
        </p>
        <p className="es-c-line">
          <SheetLine qty={`${block.count}x`} note={LEVEL_NAMES[level]}>
            {gen.title}
          </SheetLine>
        </p>
      </Frame>
    )
  }

  return (
    <Suspense fallback={<Frame scope={scope} family={block.family} phase="loading" state="loading" loadingLabel="Setting up the questions" />}>
      <AttemptOf key={run.n} family={gen.id} {...(families === undefined ? {} : { families })} level={level} entropy={run.entropy} scope={scope} onRestart={start} quiet={practice} onward={onward} />
    </Suspense>
  )
}
