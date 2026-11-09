import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Link as RouterLink, type To } from 'react-router'
import { Icon } from './Glyph'

/*
 * A link in running text: underlined below the descenders, thickening under the hand, in the ink of whatever it sits
 * on. Inside the site it is the router's link; outside it opens in a new tab and says so, in words for assistive tech
 * and with the drawn arrow for the eye. The site itself never requests anything from another origin (D-033): an
 * external link is only ever followed by the reader.
 *
 * States: hover (a thicker underline), focus (the heat lamp), active (the ribbon's red as it is pressed), and an
 * unavailable link (`disabled`), which is plain quiet text that says why in its title.
 */

interface TextLinkCommon {
  children: ReactNode
  className?: string
  /** Text that cannot be followed yet: shown quiet, not as a link. */
  disabled?: boolean
  /** Why it cannot be followed. */
  disabledReason?: string
  'data-force'?: 'hover' | 'focus' | 'active'
}

export type TextLinkProps = TextLinkCommon & ({ to: To; href?: never } | { href: string; to?: never })

export function TextLink({ children, className, disabled = false, disabledReason, to, href, 'data-force': force }: TextLinkProps) {
  if (disabled) {
    return (
      <span className={clsx('es-link', className)} data-disabled title={disabledReason}>
        {children}
      </span>
    )
  }
  if (to !== undefined) {
    return (
      <RouterLink to={to} className={clsx('es-link', className)} data-force={force}>
        {children}
      </RouterLink>
    )
  }
  return (
    <a href={href} className={clsx('es-link', className)} target="_blank" rel="noreferrer noopener" data-force={force}>
      {children}
      <Icon name="external" className="es-link__external" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
