/*
 * Selection (ARCHITECTURE §6.4, `Selection`; GAMES.md §2.3, "Input"): one model for pointer picks and keyboard selection.
 *
 *   - A 3D pick resolves an `instanceId` to the entity's id, selects it, and moves focus to that entity's DOM option, so the
 *     pointer and the screen reader meet in one place.
 *   - The DOM list is a listbox with a roving tabindex: one option is in the tab order, arrows move it, and selection
 *     follows it. The list is always a way to select; a 3D object never is the only one (A§6.8).
 *
 * The state lives outside the views, with the rest of the session's UI state, so a swap between 2D and 3D, or a lost
 * context, keeps it.
 */
import { useCallback, useMemo, useReducer } from 'react'

export interface SelectionState {
  /** The selected entity, or none. */
  readonly selected: string | null
  /** The option in the tab order. It follows the selection, and starts at the first option. */
  readonly active: string | null
  /** Bumped when focus should move to the active option (after a pick): the list focuses it. */
  readonly focusTick: number
}

export type SelectionAction =
  | { type: 'select'; id: string | null; focus?: boolean }
  | { type: 'move'; by: 'next' | 'previous' | 'first' | 'last' }
  | { type: 'sync'; ids: readonly string[] }

export const EMPTY_SELECTION: SelectionState = { selected: null, active: null, focusTick: 0 }

/** The reducer. `ids` is the list in order: the options the listbox shows. */
export function selectionReducer(state: SelectionState, action: SelectionAction, ids: readonly string[]): SelectionState {
  switch (action.type) {
    case 'select': {
      if (action.id !== null && !ids.includes(action.id)) return state
      return {
        selected: action.id,
        active: action.id ?? state.active,
        focusTick: action.focus ? state.focusTick + 1 : state.focusTick,
      }
    }
    case 'move': {
      if (ids.length === 0) return state
      const at = state.active === null ? -1 : ids.indexOf(state.active)
      const index =
        action.by === 'first' ? 0 : action.by === 'last' ? ids.length - 1 : action.by === 'next' ? Math.min(ids.length - 1, at + 1) : Math.max(0, at - 1)
      const id = ids[index]
      return { selected: id, active: id, focusTick: state.focusTick }
    }
    case 'sync': {
      // The options changed (a new step, a new level): keep what still exists.
      const selected = state.selected !== null && action.ids.includes(state.selected) ? state.selected : null
      const active = state.active !== null && action.ids.includes(state.active) ? state.active : (selected ?? null)
      return selected === state.selected && active === state.active ? state : { ...state, selected, active }
    }
  }
}

/** Resolves a pick on an instanced mesh: the instance's index to the id of the entity it draws. */
export function pickedId(instanceIds: readonly string[], instanceId: number | undefined): string | null {
  if (instanceId === undefined || instanceId < 0 || instanceId >= instanceIds.length) return null
  return instanceIds[instanceId]
}

export interface Selection extends SelectionState {
  select(id: string | null, options?: { focus?: boolean }): void
  move(by: 'next' | 'previous' | 'first' | 'last'): void
  /** The option that holds the tab stop: the active one, else the first. */
  readonly tabStop: string | null
}

/** The selection over a list of ids. An id that leaves the list is dropped. */
export function useSelection(ids: readonly string[]): Selection {
  const [raw, dispatch] = useReducer(
    (state: SelectionState, action: { action: SelectionAction; ids: readonly string[] }) => selectionReducer(state, action.action, action.ids),
    EMPTY_SELECTION,
  )
  // An id that left the list stops being selected, without an effect that writes state after the fact.
  const state = useMemo(() => selectionReducer(raw, { type: 'sync', ids }, ids), [raw, ids])
  const select = useCallback((id: string | null, options?: { focus?: boolean }) => dispatch({ action: { type: 'select', id, focus: options?.focus }, ids }), [ids])
  const move = useCallback((by: 'next' | 'previous' | 'first' | 'last') => dispatch({ action: { type: 'move', by }, ids }), [ids])
  return { ...state, select, move, tabStop: state.active ?? ids[0] ?? null }
}
