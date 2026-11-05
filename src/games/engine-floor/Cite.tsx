import { ENGINE_NAMES } from '@es/play/engine-floor/engine'
import type { StageNote } from '@es/play/engine-floor/types'
import { MECHANISM_WORDS, placeName } from '@es/play/engine-floor/words'
import { TextLink } from '@/design/components/TextLink'
import { Code } from './Code'
import { HandoffGlyph } from './HandoffGlyph'
import { permalink } from './text'

/*
 * A stage cited to its source (GAMES.md §5: "The reason names the rule, or cites the pinned source file and symbol"): whose stage it is, its
 * hand-off and its label, where it runs, and the file, symbol, line and quote it is read from at the commit the course pins, with the link
 * to that line. The link is only ever followed by the reader (D-033); the page requests nothing from the repository.
 */

export function Cite({ title, note }: { title: string; note: StageNote }) {
  const { source } = note
  const words = MECHANISM_WORDS[note.mechanism]
  return (
    <div className="flex flex-col gap-1" data-cite="">
      <p className="font-bold">{title}</p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <HandoffGlyph mechanism={note.mechanism} className="size-4 flex-none self-center" />
        <span className="es-type-ticket">
          {words.kitchen} · {note.mechanism}
        </span>
        <span>
          <Code>{note.label}</Code>
        </span>
      </p>
      <p className="text-text-2">
        {ENGINE_NAMES[note.engine]}, from <code className="es-type-mono">{placeName(note.from)}</code> to <code className="es-type-mono">{placeName(note.to)}</code>.
      </p>
      <p className="es-type-mono [overflow-wrap:anywhere]">
        <TextLink href={permalink(source)}>{source.path}</TextLink>
        {' · '}
        {source.symbol}
        {' · line '}
        <span className="font-numeric">{source.line}</span>
        {' at '}
        {source.ref.slice(0, 7)}
      </p>
      <p>
        <code className="es-type-mono text-text-2 [overflow-wrap:anywhere]">{source.quote}</code>
      </p>
    </div>
  )
}
