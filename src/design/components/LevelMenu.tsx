import clsx from 'clsx'
import { useId, useState } from 'react'
import '../parts.css'

/*
 * The level menu: one control for a game's levels, in the title strip (REDESIGN 2.6), never a row of chips. Its face reads "Level
 * 2 of 9 · Refill a freed slot · practice", so the level's number, title and kind are always in words. It is the platform's own
 * select, so every key the platform gives a select works (arrows, Home, End, type to find, Enter or Space to open), and a phone
 * opens its own picker. A level that is not published yet is in the list, unavailable, and says so. The select draws the box and
 * takes the keys; a face laid over it prints the same words, so that when a phone cuts the title short the kind still shows.
 *
 * States: hover (the well), focus (the ink ring), active (pressed into the well), disabled (quiet ink, dashed edge).
 */

export interface LevelOption {
  id: string
  title: string
  mode: 'practice' | 'graded'
  /** Not published yet: listed, and not chosen. */
  unavailable?: boolean
}

export interface LevelMenuProps {
  levels: readonly LevelOption[]
  value: string
  onChange?: (id: string) => void
  /** The control's name: "Level". */
  label?: string
  disabled?: boolean
  className?: string
  'data-force'?: 'hover' | 'focus' | 'active'
}

/** The words a level reads as, in the menu and wherever the level is named on its own. */
function levelWords(levels: readonly LevelOption[], index: number): string {
  const level = levels[index]
  return `Level ${index + 1} of ${levels.length} · ${level.title} · ${level.unavailable ? 'not published yet' : level.mode}`
}

export function LevelMenu({ levels, value, onChange, label = 'Level', disabled = false, className, 'data-force': force }: LevelMenuProps) {
  const id = useId()
  const [shown, setShown] = useState(value)
  const current = onChange ? value : shown
  const index = levels.findIndex((level) => level.id === current)
  const face = index >= 0 ? { index, level: levels[index] } : null
  const choice = onChange ? { value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) } : { defaultValue: value, onChange: (event: { target: { value: string } }) => setShown(event.target.value) }
  return (
    <span className={clsx('es-level', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} className="es-level__select" disabled={disabled} data-force={force} {...choice}>
        {levels.map((level, index) => (
          <option key={level.id} value={level.id} disabled={level.unavailable}>
            {levelWords(levels, index)}
          </option>
        ))}
      </select>
      {face ? (
        <span className="es-level__face" aria-hidden="true">
          <span>
            Level {face.index + 1} of {levels.length} ·
          </span>
          <span className="es-level__title">{face.level.title}</span>
          <span className="es-level__mode">· {face.level.unavailable ? 'not published yet' : face.level.mode}</span>
        </span>
      ) : null}
      <svg className="es-level__chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="m3.5 6 4.5 4.5L12.5 6" />
      </svg>
    </span>
  )
}
