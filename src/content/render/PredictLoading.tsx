import type { CompiledBlock } from '@es/schema'
import { Tagged } from './Tagged'

/*
 * Where a guess stands while its chunk loads: the guess's own frame and its stem, which the page already holds, and the room that the rule,
 * the field, the sureness and Commit take under them (.es-guess__reserve, lesson.css), so that nothing below it moves when it arrives. A
 * lesson page, the module page and a game's instrument each wrap the lazy guess in this.
 */
export function PredictLoading({ block, label = 'Your guess' }: { block: Extract<CompiledBlock, { type: 'predict' }>; label?: string }) {
  return (
    <section className="es-guess" data-block="predict" data-predict={block.id} data-phase="loading" role="group" aria-label={label} aria-busy="true">
      <p className="es-guess__label">{label}</p>
      <p className="es-guess__ask">
        <Tagged text={block.prompt} />
      </p>
      <div className="es-guess__reserve" aria-hidden="true" />
    </section>
  )
}
