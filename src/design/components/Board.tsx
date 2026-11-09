import clsx from 'clsx'
import { Link, NavLink } from 'react-router'
import { Icon } from './Glyph'

/*
 * The board: the site's navigation, a stainless strip along the top of the pass with the house's nameplate riveted at
 * its left and each place stamped beside it. The page you are on sits under the heat lamp: it is the present. Below
 * the page, the kick-plate carries the back-of-house links in deep steel.
 *
 * The link text is the engine's term, the one the learner meets everywhere else (GAMES.md §2.6, rule 2): Map, Play,
 * Today, Receipts, Evidence. The kitchen's word for the map, the menu, rides on MenuLink, where the front page's run
 * ends ("open the menu").
 *
 * States: hover (the stamp darkens and underlines), focus (the heat lamp), active (pressed), current (under the lamp).
 */

export interface BoardLink {
  to: string
  label: string
}

export interface BoardProps {
  /** The landmark's name: "Primary", "Footer". */
  label: string
  links: readonly BoardLink[]
  /** The nameplate: the house's name, linking home. */
  brand?: BoardLink
  variant?: 'board' | 'kickplate'
  className?: string
}

export function Board({ label, links, brand, variant = 'board', className }: BoardProps) {
  return (
    <nav aria-label={label} className={clsx('es-board', className)} data-variant={variant}>
      {brand ? (
        <NavLink to={brand.to} end className="es-board__plate">
          {brand.label}
        </NavLink>
      ) : null}
      <ul className="es-board__links">
        {links.map(({ to, label: text }) => (
          <li key={to}>
            <NavLink to={to} className="es-board__link">
              {text}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The way to the course map in the kitchen's words: "open the menu", with the engine's term beside it. It is printed
 * on the printer on the front page, and wherever a run ends.
 */
export function MenuLink({ to = '/map', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={clsx('es-menu-link', className)}>
      <span className="es-menu-link__words">Open the menu</span>
      <span className="es-menu-link__term">course map</span>
      <Icon name="arrow" className="es-menu-link__arrow" />
    </Link>
  )
}
