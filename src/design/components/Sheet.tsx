import clsx from 'clsx'
import { useId, type HTMLAttributes, type ReactNode } from 'react'
import { Icon } from './Glyph'
import { PrintingDots } from './PrintingDots'

/*
 * A sheet (REDESIGN 2.8): a plain paper panel, cut square, with the soft sheet shadow and a title. It is the surface reading
 * text sits on. A sheet can be a container (article, section) or a thing you choose (`as="button"`). `hole` is accepted and draws nothing.
 *
 * States: default; `lamp` (the sheet the next decision acts on: an ink rule across its top); loading (a line of text); error
 * (a line in the second ink); empty (a dashed blank); disabled (no shadow, a dashed edge). A button sheet also lifts under
 * the hand.
 */

export type SheetState = 'default' | 'loading' | 'error' | 'empty' | 'disabled'

export interface SheetProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'article' | 'section' | 'div' | 'li' | 'button'
  /** The printed head line, left: the ticket's number. */
  head?: ReactNode
  /** The head line, right: the table, the time. */
  meta?: ReactNode
  /** The printed foot line under the body, above the stub: what the head line says, on a ticket whose headline leads. */
  foot?: readonly [ReactNode, ReactNode?]
  /** The stamped headline. */
  title?: ReactNode
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4' | 'p'
  /** The tear-off stub below the perforation (a Stub). */
  stub?: ReactNode
  /** The punched hole the rail's clip or the spike goes through. */
  hole?: boolean
  /** Under the heat lamp: the place the next decision acts on. */
  lamp?: boolean
  state?: SheetState
  /** The red line printed on an error. */
  error?: ReactNode
  /** What a blank ticket says. */
  empty?: ReactNode
  /** What the printer says while it prints. */
  loadingLabel?: string
  width?: 'narrow' | 'wide' | 'full'
  /** A small ticket, as on the rail's clips. */
  compact?: boolean
  /** For the design page's specimens: show a pointer state without a pointer. */
  'data-force'?: 'hover' | 'focus' | 'active'
  onClick?: HTMLAttributes<HTMLElement>['onClick']
}

export function Sheet({
  as: Element = 'article',
  head,
  meta,
  foot,
  title,
  titleAs = 'h3',
  stub,
  hole = true,
  lamp = false,
  state = 'default',
  error,
  empty,
  loadingLabel = 'Getting this ready',
  width = 'narrow',
  compact = false,
  className,
  children,
  ...rest
}: SheetProps) {
  const interactive = Element === 'button'
  // A button holds phrasing content only, so a button ticket is built from spans.
  const Box = interactive ? 'span' : 'div'
  const Title = interactive ? 'span' : titleAs
  const errorId = useId()
  const buttonProps = interactive
    ? { type: 'button' as const, disabled: state === 'disabled', 'aria-describedby': state === 'error' ? errorId : undefined }
    : {}
  return (
    <Element
      className={clsx('es-sheet', className)}
      data-state={state}
      data-lamp={lamp || undefined}
      data-interactive={interactive || undefined}
      data-width={width}
      data-size={compact ? 'compact' : undefined}
      data-hole={hole || undefined}
      aria-busy={state === 'loading' || undefined}
      {...buttonProps}
      {...rest}
    >
      <Box className="es-sheet__sheet">
        <Box className="es-sheet__paper">
          {head || meta ? (
            <Box className="es-sheet__head">
              <span>{head}</span>
              <span>{meta}</span>
            </Box>
          ) : null}
          {title ? <Title className="es-sheet__title">{title}</Title> : null}
          {state === 'empty' ? (
            <Box className="es-sheet__blank">{empty ?? 'Nothing here yet'}</Box>
          ) : (
            <Box className="es-sheet__body">{children}</Box>
          )}
          {foot ? (
            <Box className="es-sheet__foot">
              <span>{foot[0]}</span>
              {foot[1] === undefined ? null : <span>{foot[1]}</span>}
            </Box>
          ) : null}
          {state === 'loading' ? (
            <Box className="es-sheet__printing" role="status">
              <PrintingDots />
              <span>{loadingLabel}</span>
            </Box>
          ) : null}
          {state === 'error' && error ? (
            <Box className="es-sheet__void" id={errorId} role={interactive ? undefined : 'alert'}>
              <Icon name="alert" className="es-sheet__void-mark" />
              <span>{error}</span>
            </Box>
          ) : null}
          {stub ? <Box className="es-sheet__stub">{stub}</Box> : null}
        </Box>
      </Box>
    </Element>
  )
}

/** One numbered line of a sheet: a quantity, the item, and a note at the right, in the mono face. */
export function SheetLine({
  qty,
  children,
  note,
  tone = 'ink',
}: {
  qty?: ReactNode
  children: ReactNode
  note?: ReactNode
  tone?: 'ink' | 'ink-2'
}) {
  return (
    <span className="es-sheet-line" data-tone={tone}>
      {qty !== undefined ? <span className="es-sheet-line__qty">{qty}</span> : null}
      <span className="es-sheet-line__item">{children}</span>
      {note !== undefined ? <span className="es-sheet-line__note">{note}</span> : null}
    </span>
  )
}
