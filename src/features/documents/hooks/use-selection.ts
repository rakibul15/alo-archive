'use client';

import { useCallback, useState } from 'react';
import type { DocumentFilters } from '@/lib/domain/document';
import {
  ALL_SELECTED,
  EMPTY_SELECTION,
  headerCheckState,
  isSelected,
  selectionCount,
  toggle,
  toggleAll,
  toRequest,
  type Selection,
} from '../lib/selection';

/**
 * React wrapper around the pure selection model. The logic itself lives in
 * `../lib/selection.ts` so it can be tested without rendering anything.
 */
export function useSelection(filters: DocumentFilters, matchedCount: number) {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [lastFilters, setLastFilters] = useState(filters);

  // Changing the filter changes what "all" means, so a carried-over selection
  // would silently refer to a different set of rows than the one on screen.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component before touching the DOM, so nobody ever sees the stale selection.
  // The effect version paints once with the wrong state and then corrects it.
  if (lastFilters !== filters) {
    setLastFilters(filters);
    setSelection(EMPTY_SELECTION);
  }

  return {
    selection,
    count: selectionCount(selection, matchedCount),
    checkState: headerCheckState(selection, matchedCount),
    isRowSelected: useCallback(
      (id: string) => isSelected(selection, id),
      [selection],
    ),
    toggleRow: useCallback((id: string) => {
      setSelection((current) => toggle(current, id));
    }, []),
    toggleAllRows: useCallback(() => {
      setSelection((current) => toggleAll(current, matchedCount));
    }, [matchedCount]),
    /** "Select all N matching" — the exclude-mode entry point. */
    setAllMatching: useCallback(() => {
      setSelection(ALL_SELECTED);
    }, []),
    clear: useCallback(() => {
      setSelection(EMPTY_SELECTION);
    }, []),
    request: toRequest(selection),
  };
}
