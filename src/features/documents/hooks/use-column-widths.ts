'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  COLUMN_WIDTHS_STORAGE_KEY,
  DEFAULT_COLUMN_WIDTHS,
  parseColumnWidths,
  resizeColumn,
  serializeColumnWidths,
  type ColumnWidths,
  type ResizableColumn,
} from '../lib/column-widths';

/**
 * Same `useSyncExternalStore`-over-a-module-snapshot shape as
 * `useSavedViews` and `useInterruptedBatch`, for the same reason: this is
 * mirroring `localStorage`, and a `useState` + effect version of this
 * exact pattern is what the previous two hooks in this codebase already
 * hit `react-hooks/set-state-in-effect` on.
 */
let snapshot: ColumnWidths = DEFAULT_COLUMN_WIDTHS;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  snapshot = parseColumnWidths(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY));
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return DEFAULT_COLUMN_WIDTHS;
}

function persist(next: ColumnWidths) {
  snapshot = next;
  localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, serializeColumnWidths(next));
  for (const listener of listeners) listener();
}

export function useColumnWidths() {
  const widths = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const resize = useCallback((column: ResizableColumn, deltaPx: number) => {
    persist(resizeColumn(snapshot, column, deltaPx));
  }, []);

  /** Double-clicking a column's handle resets just that column, not the whole table. */
  const resetColumn = useCallback((column: ResizableColumn) => {
    persist({ ...snapshot, [column]: DEFAULT_COLUMN_WIDTHS[column] });
  }, []);

  const reset = useCallback(() => {
    persist(DEFAULT_COLUMN_WIDTHS);
  }, []);

  return { widths, resize, resetColumn, reset };
}
