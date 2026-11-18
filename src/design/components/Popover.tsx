import clsx from 'clsx'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as KeyEvent, type MouseEvent as PressEvent, type ReactNode } from 'react'
import { Icon } from './Glyph'
import '../parts.css'

/*
 * A popover: a small sheet of paper that opens from its trigger and floats over the page (REDESIGN 2.5 and 2.6: a claim's
 * source, a part's source, the tag legend, what a model leaves out). It is not a modal: nothing behind it is disabled and focus is
 * not trapped.
 *
 * It opens on activation only (a click, Enter or Space on its trigger, which is a real button), never on focus or hover alone. It
 * closes on Escape, on a press outside it, on its Close button, and when focus leaves it for another control. Escape, Close and a
 * press on nothing focusable hand focus back to the trigger; a press on another control leaves focus there.
 *
 * Triggers: `button` is an outline control ("Parts"), `quiet` is a line of text ("What this model leaves out"), `mark` is a
 * claim's small numbered mark in running text, and `stamp` is a provenance word (the Stamp component). Each is at least 44 px on its
 * short side: the mark and the stamp draw small inside a 44 px box that eats its own height out of the line.
 */

export interface PopoverProps {
  /** What the trigger shows. */
  trigger: ReactNode
  /** The trigger's accessible name, when its visible text needs more words. Keep the visible words at its start. */
  triggerLabel?: string
  /** The sheet's title, which names it. */
  title: ReactNode
  children: ReactNode
  variant?: 'button' | 'quiet' | 'mark' | 'stamp'
  /** `wide` for a card's worth of reading (what a model leaves out); `narrow` for a source or a legend. */
  width?: 'narrow' | 'wide'
  /** Render as phrasing content, inside a paragraph. The sheet's content must then be phrasing content too. */
  inline?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  className?: string
  triggerClassName?: string
  /**
   * Make the trigger a link to this address, for a claim's mark whose entry is in the page's Sources: a plain click, Enter or Space opens
   * the sheet, and a click that asks for a new tab (or a page with no script) follows the link.
   */
  href?: string
  /** Extra data on the trigger: the stamp's word, for its colour. */
  triggerData?: Record<`data-${string}`, string | undefined>
  'data-force'?: 'hover' | 'focus' | 'active'
}

const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'

export function Popover({
  trigger,
  triggerLabel,
  title,
  children,
  variant = 'button',
  width = 'narrow',
  inline = false,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  disabled = false,
  className,
  triggerClassName,
  triggerData,
  href,
  'data-force': force,
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = controlled ?? uncontrolled
  const id = useId()
  const panelId = `${id}-panel`
  const titleId = `${id}-title`
  const wrapRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlled === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [controlled, onOpenChange],
  )

  const closeAndReturn = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [setOpen])

  useEffect(() => {
    if (!open) return
    // Several popovers can be open at once, so each answers only for the focus it holds: Escape closes the one that focus is in
    // (or every one, when focus is nowhere), and a press outside hands focus back only to the one that had it.
    const holdsFocus = () => {
      const active = document.activeElement
      return Boolean(active && wrapRef.current?.contains(active))
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const nowhere = !document.activeElement || document.activeElement === document.body
      if (!holdsFocus() && !nowhere) return
      event.preventDefault()
      closeAndReturn()
    }
    const onPress = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target || wrapRef.current?.contains(target)) return
      const had = holdsFocus()
      setOpen(false)
      // A press on another control takes focus there; a press on nothing hands it back to the trigger once the press has blurred.
      if (had && !target.closest(FOCUSABLE)) window.setTimeout(() => triggerRef.current?.focus({ preventScroll: true }), 0)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPress)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [open, setOpen, closeAndReturn])

  // Keep the sheet on screen: when it would run past the viewport's end, slide it back by the overrun.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return
    panel.style.removeProperty('--pop-shift')
    const overrun = panel.getBoundingClientRect().right - (document.documentElement.clientWidth - 16)
    // The exact overrun, not a whole pixel more: a sheet that stops a fraction short of the gutter leaves a sliver of the control under it, which is a target of its own.
    if (overrun > 0) panel.style.setProperty('--pop-shift', `${-overrun}px`)
  }, [open])

  const Wrap = inline ? 'span' : 'div'
  const Trigger = (href === undefined ? 'button' : 'a') as 'button'
  const Part = inline ? 'span' : 'div'
  return (
    <Wrap
      ref={wrapRef as never}
      className={clsx('es-pop', className)}
      data-variant={variant}
      data-open={open || undefined}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null
        if (open && next && !event.currentTarget.contains(next)) setOpen(false)
      }}
    >
      <Trigger
        ref={triggerRef}
        {...(href === undefined ? { type: 'button', disabled } : { href, onKeyDown: (event: KeyEvent<HTMLElement>) => event.key === ' ' && (event.preventDefault(), setOpen(!open)) })}
        className={clsx('es-pop__trigger', triggerClassName)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        data-force={force}
        onClick={(event: PressEvent<HTMLElement>) => {
          // A link's click that asks for another tab, or a window, follows the link.
          if (href !== undefined) {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
          }
          setOpen(!open)
        }}
        {...triggerData}
      >
        {trigger}
      </Trigger>
      {open ? (
        <Part ref={panelRef as never} className="es-pop__panel" id={panelId} role="dialog" aria-labelledby={titleId} data-width={width}>
          <Part className="es-pop__head">
            <span className="es-pop__title" id={titleId}>
              {title}
            </span>
            <button type="button" className="es-pop__close" aria-label="Close" onClick={closeAndReturn}>
              <Icon name="strike" />
            </button>
          </Part>
          <Part className="es-pop__body">{children}</Part>
        </Part>
      ) : null}
    </Wrap>
  )
}
