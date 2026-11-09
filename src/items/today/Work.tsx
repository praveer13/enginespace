import { useEffect, useRef, useState } from 'react'
import type { LocalDay } from '@es/ledger'
// By path, not through the package's index, which brings the registry and every family's code with it (D-059).
import { seenKey } from '@es/play/items/attempt'
import type { Answered } from '@es/play/items/attempt'
import { LEVEL_NAMES } from '@es/play/items/types'
import type { Confidence, Gen, Response } from '@es/play/items/types'
import { Stub } from '@/design/components/Stub'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { useEvidence } from '@/evidence/useEvidence'
import { Givens, Question, Reveal, SurePlates, Unsaved, Worked } from '../Attempt'
import { parseNumber, seedLabel } from '../answer'
import { RichText } from '../Rich'
import '@/content/render/content.css'
import '../items.css'
import type { Card } from './cards'
import { CHECK_TICKET, FINISH_PREP, NEXT_TICKET, placeLine } from './copy'
import { formatDay } from './days'
import { drawForKc } from './draw'
import { returnDay } from './plan'
import type { Result } from './plan'
import { ratingOf, reviewDraft } from './review'
import type { Line } from './session'

/*
 * The ticket being prepped: one order ticket for one line of the list, on a seed drawn now. It is the item
 * block's ticket (src/items/Attempt.tsx): the question and its numbers, a slip or ticked lines for the answer, three plates for how
 * sure, a stub to check it, and the reveal below the perforation. Checking it is final, as it is in a lesson, and writes a `review:<kc>`
 * event with the FSRS grade (review.ts). The reveal then adds the one line the item block has no use for: the day the idea comes back.
 *
 * The component is keyed by the line's place in the list, so each ticket starts clean, and it takes its entropy from outside: the page
 * reads `crypto.getRandomValues` when it starts the prep and when it moves to the next ticket (ARCHITECTURE §8.2). It takes the family's
 * code from outside too: the page loads it when the ticket comes up (src/items/families.ts, D-059).
 */

export interface WorkProps {
  line: Line
  index: number
  total: number
  /** One uint32 of entropy for this ticket, read when it was asked for. */
  entropy: number
  /** What the learner has met, as `seenKey`s: the seed of this ticket is not one of them. */
  met: ReadonlySet<string>
  /** The card as it stood when the ticket came up, for the day it comes back. */
  card: Card | undefined
  today: LocalDay
  last: boolean
  onChecked: (result: Result) => void
  onNext: () => void
  /** The family that serves the line: its code, which draws, grades and explains the item. */
  gen: Gen
}

export default function Work({ line, index, total, entropy, met, card, today, last, onChecked, onNext, gen }: WorkProps) {
  const evidence = useEvidence()
  if (gen.id !== line.family) throw new Error(`the line is served by the family "${line.family}", and the ticket was given "${gen.id}"`)
  // Drawn once, when the ticket comes up. A later change to what the learner has met (this very answer, once it is written) must not redraw it.
  const [drawn] = useState(() => drawForKc(gen, line.kc, line.level, entropy, met))
  const { item } = drawn
  const [text, setText] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [conf, setConf] = useState<Confidence | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const [back, setBack] = useState<LocalDay | null>(null)
  const [unsaved, setUnsaved] = useState<string | null>(null)
  const count = useRef<HTMLHeadingElement>(null)
  const verdict = useRef<HTMLHeadingElement>(null)

  // The ticket that has come up takes focus: the stub that was pulled has gone, and a keyboard would be left behind. After a check, the verdict does.
  useEffect(() => {
    count.current?.focus()
  }, [])
  const checked = answered !== null
  useEffect(() => {
    if (checked) verdict.current?.focus()
  }, [checked])

  const check = () => {
    // An answer is final: a second press of the stub, or of Enter, after the ticket is checked does nothing.
    if (answered !== null) return
    const spec = item.answer
    let response: Response
    if (spec.kind === 'numeric') {
      const value = parseNumber(text, spec.unit)
      if (value === null) {
        setProblem(`Write a number, in ${spec.unit}, and then check the ticket.`)
        return
      }
      response = { kind: 'numeric', value }
    } else {
      if (pick === null) {
        setProblem('Tick one line, and then check the ticket.')
        return
      }
      response = { kind: 'choice', pick }
    }
    setProblem(null)
    const grade = gen.grade(item, response)
    const given = conf === null ? {} : { conf }
    const rating = ratingOf({ ok: grade.ok, ...given })
    const comesBack = returnDay(card, today, rating)
    setAnswered({ response, grade, ...given })
    setBack(comesBack)
    onChecked({ line, ok: grade.ok, grade: rating, back: comesBack, key: seenKey(gen.id, item.variant, item.seed) })
    // The answer is final the moment it is checked, so it is written then. A ledger that cannot take it says so, and the ticket reads on.
    evidence.append(reviewDraft({ kc: line.kc, item, ok: grade.ok, score: grade.score, ...given })).then(
      (result) => {
        if (!result.ok) setUnsaved(result.detail)
      },
      (error: unknown) => setUnsaved(error instanceof Error ? error.message : String(error)),
    )
  }

  const revealed = answered !== null
  return (
    <Ticket
      as="section"
      className="es-c-block es-prep__ticket"
      data-block="item"
      data-phase={revealed ? 'revealed' : 'asking'}
      data-kc={line.kc}
      data-seed={String(item.seed)}
      data-level={String(item.level)}
      data-variant={item.variant}
      data-kind={item.answer.kind}
      data-rev={item.rev}
      data-ok={revealed ? String(answered.grade.ok) : undefined}
      width="wide"
      head={<span aria-hidden="true">Prep list</span>}
      meta={line.kc}
      title={gen.title}
      titleAs="h2"
      lamp={!revealed}
      foot={[`seed ${seedLabel(item.seed)}`, 'unseen']}
      stub={revealed ? <Stub onClick={onNext}>{last ? FINISH_PREP : NEXT_TICKET}</Stub> : <Stub onClick={check}>{CHECK_TICKET}</Stub>}
    >
      <h3 className="es-item__count" tabIndex={-1} ref={revealed ? undefined : count}>
        <span>{placeLine(index, total)}</span> <span className="es-item__level">{LEVEL_NAMES[item.level]}</span>
      </h3>
      <p className="es-item__stem">
        <RichText parts={item.stem} />
      </p>
      <Givens item={item} />
      {item.worked.length > 0 ? <Worked item={item} /> : null}
      <Question
        item={item}
        text={text}
        pick={pick}
        locked={revealed}
        problem={revealed ? null : problem}
        onText={(value) => {
          setText(value)
          setProblem(null)
        }}
        onPick={(id) => {
          setPick(id)
          setProblem(null)
        }}
        onSubmit={check}
      />
      {revealed ? null : <SurePlates value={conf} onChange={setConf} />}
      {revealed ? (
        <Reveal
          gen={gen}
          item={item}
          answered={answered}
          headingRef={verdict}
          after={
            back === null ? null : (
              <p className="es-prep__back">
                <TicketLine note={formatDay(back)}>comes back</TicketLine>
              </p>
            )
          }
        />
      ) : null}
      {unsaved === null ? null : <Unsaved detail={unsaved} />}
    </Ticket>
  )
}
