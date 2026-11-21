import { codePieces } from './words'

/**
 * A line of packages/play/shape-shifter/copy.ts with its code spans set as code: an operation's name, `tl.arange`. A module of its own, so
 * the dock and the result both read it and the result's chunk does not pull in the dock.
 */
export function Words({ line }: { line: string }) {
  return (
    <>
      {codePieces(line).map((piece, i) => (piece.code ? <code key={i}>{piece.text}</code> : <span key={i}>{piece.text}</span>))}
    </>
  )
}
