/**
 * Row selection over a result set the client has never fully seen.
 *
 * The naive model — an array of selected ids — breaks the moment somebody ticks
 * "select all" against 100,000 matching rows: building it means fetching every
 * id, holding 100,000 strings, and sending them back on the next action. And
 * the common follow-up ("select all, then untick these three") is exactly the
 * case it handles worst.
 *
 * So selection is stored as a mode plus a small exception set:
 *
 *   include — nothing is selected except these ids
 *   exclude — everything matching the current filter is selected, except these
 *
 * "Select all 100,000 then deselect 3" is three strings either way round, and
 * the server is sent the *filter* rather than an enormous id list.
 */
export type Selection =
  | { mode: 'include'; ids: ReadonlySet<string> }
  | { mode: 'exclude'; ids: ReadonlySet<string> };

export const EMPTY_SELECTION: Selection = {
  mode: 'include',
  ids: new Set(),
};

export const ALL_SELECTED: Selection = {
  mode: 'exclude',
  ids: new Set(),
};

export function isSelected(selection: Selection, id: string): boolean {
  return selection.mode === 'include'
    ? selection.ids.has(id)
    : !selection.ids.has(id);
}

/**
 * How many rows are selected. Needs `matchedCount` because in exclude mode the
 * answer depends on the size of the filtered set, which only the server knows.
 */
export function selectionCount(
  selection: Selection,
  matchedCount: number,
): number {
  return selection.mode === 'include'
    ? selection.ids.size
    : Math.max(matchedCount - selection.ids.size, 0);
}

export function isEmpty(selection: Selection, matchedCount: number): boolean {
  return selectionCount(selection, matchedCount) === 0;
}

export function toggle(selection: Selection, id: string): Selection {
  const ids = new Set(selection.ids);
  if (ids.has(id)) {
    ids.delete(id);
  } else {
    ids.add(id);
  }
  return { mode: selection.mode, ids };
}

/** Ticking the header checkbox flips between "all of them" and "none of them". */
export function toggleAll(
  selection: Selection,
  matchedCount: number,
): Selection {
  return isEmpty(selection, matchedCount) ? ALL_SELECTED : EMPTY_SELECTION;
}

export type SelectionCheckState = 'checked' | 'unchecked' | 'indeterminate';

export function headerCheckState(
  selection: Selection,
  matchedCount: number,
): SelectionCheckState {
  const count = selectionCount(selection, matchedCount);
  if (count === 0) return 'unchecked';
  if (count === matchedCount) return 'checked';
  return 'indeterminate';
}

/**
 * What to send to a bulk endpoint. In exclude mode the request carries the
 * filter and the handful of exceptions rather than an id per row — the point
 * of the whole model.
 */
export type SelectionRequest =
  { kind: 'ids'; ids: string[] } | { kind: 'filter'; except: string[] };

export function toRequest(selection: Selection): SelectionRequest {
  return selection.mode === 'include'
    ? { kind: 'ids', ids: [...selection.ids] }
    : { kind: 'filter', except: [...selection.ids] };
}
