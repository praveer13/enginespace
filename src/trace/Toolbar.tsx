import type { ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { CATEGORIES, CATEGORY_WORDS } from './marks'
import type { Category } from './marks'
import { SlotGlyph } from './SlotGlyph'
import type { TapeState } from './state'
import { slotOfCategory } from './words'

/*
 * The plates (DESIGN.md, "Buttons"): every command the keys reach, as a button for a pointer and a touch screen. A plate carries the
 * id of the command it is in `data-command`, the same id as its key in keys.ts, and a test holds the two lists equal, so no
 * command is a key without a plate or a plate without a key. A plate that cannot apply right now is disabled, and the key says so
 * aloud instead.
 *
 * The groups are labelled for a screen reader. They are not an ARIA toolbar: a toolbar promises arrow-key movement among its
 * controls, and the arrows are the tape's pan.
 */

export interface ToolbarProps {
  state: TapeState
  readOnly: boolean
  /** A plate was pressed: the id of its command. */
  onCommand: (id: string) => void
}

interface PlateSpec {
  id: string
  label: ReactNode
  /** A longer name for assistive technology, when the label alone is not enough. */
  name?: string
  keys?: string
  pressed?: boolean
  disabled?: boolean
  variant?: 'plate' | 'ink'
}

function Plates({ label, plates, onCommand }: { label: string; plates: readonly PlateSpec[]; onCommand: (id: string) => void }) {
  return (
    <div role="group" aria-label={label} className="es-trace__group">
      {plates.map((plate) => (
        <Button
          key={plate.id}
          size="sm"
          variant={plate.variant ?? (plate.pressed ? 'ink' : 'plate')}
          data-command={plate.id}
          aria-label={plate.name}
          aria-keyshortcuts={plate.keys}
          aria-pressed={plate.pressed}
          disabled={plate.disabled}
          onClick={() => onCommand(plate.id)}
        >
          {plate.label}
        </Button>
      ))}
    </div>
  )
}

/** The category of the mark that a tag key would change: the one being made, else the active one. */
function taggedCategory(state: TapeState): Category | null {
  if (state.pending !== null) return state.pending.category
  const active = state.notes.marks.find((mark) => mark.id === state.active)
  return active === undefined ? null : active.category
}

export function Toolbar({ state, readOnly, onCommand }: ToolbarProps) {
  const tagged = taggedCategory(state)
  const making = state.pending !== null
  const hasActive = state.active !== null
  return (
    <div className="es-trace__bar" data-trace-bar="">
      <Plates
        label="Window"
        onCommand={onCommand}
        plates={[
          { id: 'zoom-out', label: 'Zoom out', keys: '-' },
          { id: 'zoom-in', label: 'Zoom in', keys: '+' },
          { id: 'pan-left', label: 'Pan back', name: 'Pan back in time', keys: 'ArrowLeft' },
          { id: 'pan-right', label: 'Pan on', name: 'Pan on in time', keys: 'ArrowRight' },
          { id: 'fit-step', label: 'This step', name: 'Fit this step', keys: 'F' },
          { id: 'fit-all', label: 'Whole tape', name: 'Fit the whole tape', keys: 'A' },
        ]}
      />
      <Plates
        label="Cursor"
        onCommand={onCommand}
        plates={[
          { id: 'bell-prev', label: 'Step back', name: 'Step back: go to the previous step', keys: 'Shift+Comma' },
          { id: 'bell-next', label: 'Step on', name: 'Step on: go to the next step', keys: 'Shift+Period' },
          { id: 'edge-prev', label: 'Edge back', name: 'Edge back: move to the previous event edge on this lane', keys: 'J' },
          { id: 'edge-next', label: 'Edge on', name: 'Edge on: move to the next event edge on this lane', keys: 'K' },
        ]}
      />
      {readOnly ? null : (
        <>
          <Plates
            label="Marks"
            onCommand={onCommand}
            plates={[
              { id: 'mark', label: making ? 'Finish mark' : 'Mark', name: making ? 'Finish mark: end it at the cursor' : 'Mark: start a mark at the cursor', keys: 'M', variant: 'ink' },
              { id: 'cancel', label: 'Cancel', name: 'Cancel the mark being made', keys: 'Escape', disabled: !making },
              { id: 'cause', label: 'Cause', name: 'Cause: name the event at the cursor as the cause', keys: 'X', pressed: state.cursor !== null && state.notes.cause === state.cursor.span },
              { id: 'remove', label: 'Remove', name: 'Remove the mark', keys: 'Delete', disabled: !hasActive },
            ]}
          />
          <div role="group" aria-label="Tag the mark" className="es-trace__group">
            {CATEGORIES.map((category, at) => (
              <Button
                key={category}
                size="sm"
                variant={tagged === category ? 'ink' : 'plate'}
                data-command={`category-${category}`}
                aria-pressed={tagged === category}
                aria-keyshortcuts={String(at + 1)}
                aria-label={`${CATEGORY_WORDS[category].term}, ${CATEGORY_WORDS[category].kitchen}`}
                disabled={!making && !hasActive}
                onClick={() => onCommand(`category-${category}`)}
              >
                <SlotGlyph slot={slotOfCategory(category)} size="1.05em" />
                {CATEGORY_WORDS[category].term}
              </Button>
            ))}
          </div>
        </>
      )}
      <div className="es-trace__group">
        <Button size="sm" variant="quiet" data-command="help" aria-keyshortcuts="Shift+Slash" onClick={() => onCommand('help')}>
          Keys
        </Button>
      </div>
    </div>
  )
}
