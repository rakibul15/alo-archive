'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { summarise } from '../lib/queue';
import { useUploadStore } from '../store';

const STORAGE_KEY = 'alo.upload.interrupted';

type InterruptedBatch = { pending: number; at: string };

/* -------------------------------------------------------------------------
 * The breadcrumb, as an external store.
 *
 * It describes the *previous* page load, so it is fixed for the lifetime of
 * this one: read it once at module evaluation, clear it so a second reload
 * does not re-report a batch that has already been acknowledged, and let React
 * subscribe rather than assigning state from an effect.
 * ---------------------------------------------------------------------- */

let snapshot: InterruptedBatch | null = null;
const listeners = new Set<() => void>();

function parseBreadcrumb(raw: string): InterruptedBatch | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'pending' in parsed &&
      typeof parsed.pending === 'number' &&
      'at' in parsed &&
      typeof parsed.at === 'string'
    ) {
      return { pending: parsed.pending, at: parsed.at };
    }
  } catch {
    // A malformed breadcrumb is not worth surfacing.
  }
  return null;
}

if (typeof window !== 'undefined') {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  snapshot = raw === null ? null : parseBreadcrumb(raw);
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function dismissBreadcrumb() {
  snapshot = null;
  for (const listener of listeners) listener();
}

/**
 * The queue cannot survive a reload.
 *
 * A `File` handle is a live reference the browser will not hand back after a
 * refresh — there is no serialising it, and a "resume" button would be a lie.
 * What can be preserved is the fact that it happened, so the operator finds out
 * which files never made it instead of assuming the batch finished.
 *
 * Two halves: a beforeunload prompt while work is in flight, and the breadcrumb
 * above, which turns into a banner if they leave anyway.
 */
export function useInterruptedBatch() {
  const interrupted = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );

  const queue = useUploadStore((state) => state.queue);
  const summary = summarise(queue);
  const pending = summary.queued + summary.uploading + summary.retrying;

  useEffect(() => {
    if (pending === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pending, at: new Date().toISOString() }),
    );

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [pending]);

  return { interrupted, dismiss: dismissBreadcrumb };
}
