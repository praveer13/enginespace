import type { JSX, SVGProps } from 'react'
import type { GlyphShape } from '../code'

/*
 * Drawn marks, never Unicode stand-ins: the categorical code's shapes (every category carries one, WCAG 1.4.1) and the
 * system's few icons, all on one 24-unit grid with one stroke weight. They inherit currentColor.
 */

interface MarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** CSS size; the mark is square. */
  size?: number | string
  /** A visible-to-assistive-tech name. Without one the mark is decorative and hidden. */
  title?: string
}

function frame({ size = '1em', title, ...rest }: MarkProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    role: title ? 'img' : undefined,
    'aria-hidden': title ? undefined : true,
    'aria-label': title,
    focusable: false,
    ...rest,
  } as const
}

const SHAPES: Record<GlyphShape, (props: { edge: string }) => JSX.Element> = {
  triangle: ({ edge }) => <path d="M12 3.5 21 19.5H3Z" fill="currentColor" stroke={edge} strokeWidth="1.5" strokeLinejoin="round" />,
  circle: ({ edge }) => <circle cx="12" cy="12" r="8.25" fill="currentColor" stroke={edge} strokeWidth="1.5" />,
  diamond: ({ edge }) => <path d="M12 2.75 21.25 12 12 21.25 2.75 12Z" fill="currentColor" stroke={edge} strokeWidth="1.5" strokeLinejoin="round" />,
  square: ({ edge }) => <rect x="4" y="4" width="16" height="16" rx="1.5" fill="currentColor" stroke={edge} strokeWidth="1.5" />,
  ring: ({ edge }) => <circle cx="12" cy="12" r="7.5" fill="none" stroke={edge === 'none' ? 'currentColor' : edge} strokeWidth="3" />,
  hexagon: ({ edge }) => (
    <path d="M12 2.75 20 7.375v9.25L12 21.25 4 16.625v-9.25Z" fill="currentColor" stroke={edge} strokeWidth="1.5" strokeLinejoin="round" />
  ),
}

/** A category's shape. `edge` outlines it (a CSS colour value such as `var(--es-cat-yellow-edge)`). */
export function Glyph({ shape, edge = 'none', ...rest }: MarkProps & { shape: GlyphShape; edge?: string }) {
  return (
    <svg {...frame(rest)} data-glyph={shape}>
      {SHAPES[shape]({ edge })}
    </svg>
  )
}

const ICON_PATHS = {
  // A printed arrow: the way a stub or a link goes.
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  // Two strokes and a point: what the printer's red line says.
  alert: (
    <>
      <path d="M12 4v10" />
      <path d="M12 19.5v.01" strokeWidth="3" />
    </>
  ),
  check: <path d="m4.5 12.5 4.75 4.75L19.5 7" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
      <path d="M8.5 10.5V7.75a3.5 3.5 0 0 1 7 0v2.75" />
    </>
  ),
  // A pin through the tape: a recipe kit's pan.
  pin: (
    <>
      <path d="M9 3.5h6l-1 6 3.5 3H6.5l3.5-3Z" />
      <path d="M12 12.5v8" />
    </>
  ),
  hash: <path d="M9.5 4 7.5 20m9-16-2 16M4.5 9h15m-15 6h15" />,
  external: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14v5.5H4.5V6H10" />
    </>
  ),
  // A dumped pan: struck through.
  strike: <path d="M5 5l14 14M19 5 5 19" />,
} satisfies Record<string, JSX.Element>

export type IconName = keyof typeof ICON_PATHS

/** One of the system's icons, stroked in currentColor. */
export function Icon({ name, ...rest }: MarkProps & { name: IconName }) {
  return (
    <svg {...frame(rest)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-icon={name}>
      {ICON_PATHS[name]}
    </svg>
  )
}
