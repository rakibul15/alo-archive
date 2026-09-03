'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { pendingNames, summarise } from '../lib/queue';
import { useUploadStore } from '../store';

const STORAGE_KEY = 'alo.upload.interrupted';

/**
 * Names beyond this are still counted in `pending`, just not spelled out —
 * the banner is one line, not a file browser, and "47 uploads didn't
 * finish: a.pdf, b.pdf, c.pdf and 44 more" says everything a longer list
 * would.
 */
const MAX_REPORTED_NAMES = 5;

type InterruptedBatch = { pending: number; names: string[]; at: string };

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
      // `names` is newer than `pending`/`at` — a breadcrumb written by an
      // older build of this app (or corrupted) still parses, it just has
      // nothing to list, same as a batch of one anonymous file would.
      const names =
        'names' in parsed &&
        Array.isArray(parsed.names) &&
        parsed.names.every((n) => typeof n === 'string')
          ? parsed.names
          : [];
      return { pending: parsed.pending, names, at: parsed.at };
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

  // A ref, not a dependency: `queue` gets a new reference on every progress
  // tick (many times a second mid-upload), and re-running this effect that
  // often just to catch the rare case where the *set* of pending items
  // changed without `pending`'s count changing would defeat the point of
  // keying the effect on `pending` at all. The ref always has the latest
  // queue by the time the effect body actually runs.
  const queueRef = useRef(queue);
  useLayoutEffect(() => {
    queueRef.current = queue;
  });

  useEffect(() => {
    if (pending === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pending,
        names: pendingNames(queueRef.current).slice(0, MAX_REPORTED_NAMES),
        at: new Date().toISOString(),
      }),
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
