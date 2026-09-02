'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { DocumentFilters } from '@/lib/domain/document';
import {
  addSavedView,
  parseSavedViews,
  removeSavedView,
  SAVED_VIEWS_STORAGE_KEY,
  serializeSavedViews,
  type SavedView,
} from '../lib/saved-views';

/**
 * An external store, not `useState` + an effect that reads `localStorage` on
 * mount — `localStorage` already *is* the source of truth, and mirroring it
 * into component state via an effect would just be two copies that can
 * independently drift. Same shape as `useInterruptedBatch`: read once at
 * module evaluation (client-side only — this block is skipped entirely
 * during server rendering, so there's nothing to disagree with what the
 * server rendered), and have every mutation update the in-memory snapshot
 * and storage together before notifying subscribers.
 */
const EMPTY: readonly SavedView[] = [];

let snapshot: readonly SavedView[] = EMPTY;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  snapshot = parseSavedViews(localStorage.getItem(SAVED_VIEWS_STORAGE_KEY));
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
  return EMPTY;
}

function persist(next: readonly SavedView[]) {
  snapshot = next;
  localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(next));
  for (const listener of listeners) listener();
}

export function useSavedViews() {
  const views = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const save = useCallback((name: string, filters: DocumentFilters) => {
    persist(addSavedView(snapshot, name, filters));
  }, []);

  const remove = useCallback((id: string) => {
    persist(removeSavedView(snapshot, id));
  }, []);

  return { views, save, remove };
}
