import { Readout } from '@/design/components/Readout'
import { readoutUnit } from '@/content/render/model'
import type { Part, Rich } from '@es/play/items'

/*
 * Rich text, drawn (packages/play/items/types.ts): a run of words is words, code is code, and a number is a readout in the
 * printer's dots with its tag beside it and its unit after it (DESIGN.md, "The Dots For Numbers Rule"). A unit the readout does
 * not know is printed after it as plain text.
 */

export function PartView({ part }: { part: Part }) {
  switch (part.t) {
    case 'text':
      return part.text
    case 'code':
      return <code>{part.code}</code>
    case 'num': {
      const unit = readoutUnit(part.unit)
      return (
        <>
          <Readout value={part.value} digits={part.digits ?? 0} unit={unit} tag={part.tag} size="sm" className="es-item__num" />
          {part.unit !== undefined && unit === undefined ? <span className="es-item__unit">{part.unit}</span> : null}
        </>
      )
    }
  }
}

export function RichText({ parts }: { parts: Rich }) {
  return parts.map((part, at) => <PartView key={at} part={part} />)
}
