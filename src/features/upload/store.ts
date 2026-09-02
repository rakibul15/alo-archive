'use client';

import { create } from 'zustand';
import { clientEnv } from '@/env.client';
import { ApiError } from '@/lib/api/errors';
import {
  cancelAll as cancelAllItems,
  cancelItem,
  clearFinished as clearFinishedItems,
  createQueue,
  enqueue,
  markFailed,
  markProgress,
  markSucceeded,
  markUploading,
  pickNext,
  retryAllFailed as retryAllFailedItems,
  retryItem,
  setPaused,
  summarise,
  type QueueState,
} from './lib/queue';
import { uploadFile } from './lib/upload-file';

/**
 * In-flight requests, kept out of the store on purpose.
 *
 * An AbortController is not state anybody renders, and putting it in the store
 * would mean every progress tick copies a Map of live controllers for no
 * reason. Cancellation reads this; React never does.
 */
const controllers = new Map<string, AbortController>();

/** How often stalled work is re-examined — backoff timers wake up here. */
const PUMP_INTERVAL_MS = 250;

let pumpTimer: ReturnType<typeof setInterval> | null = null;

export type RejectionReason = 'unsupported_type' | 'too_large' | 'other';

export type RejectedFile = {
  name: string;
  size: number;
  reason: RejectionReason;
};

/**
 * Enough to report accurately without holding on to a folder's worth of names.
 * The counts stay exact; only the itemised list is capped.
 */
const MAX_REPORTED_REJECTIONS = 50;

/** Written out so a new reason is a compile error rather than a missing tally. */
function emptyRejectionTally(): Record<RejectionReason, number> {
  return { unsupported_type: 0, too_large: 0, other: 0 };
}

type UploadStore = {
  queue: QueueState;
  /** Bumped on every successful upload, so views can refresh the archive. */
  completedCount: number;
  /**
   * Files the dropzone refused. Previously discarded outright, which meant
   * dropping a folder of 300 could silently enqueue 288 with no explanation of
   * where the other twelve went.
   */
  rejections: RejectedFile[];
  rejectedCount: number;
  /**
   * Tallied as files arrive rather than counted off `rejections`, which is
   * capped. Deriving the breakdown from the capped list makes it disagree with
   * the headline — "300 files were not added: 48 unsupported" — and a summary
   * whose parts do not sum to its total is worse than no summary.
   */
  rejectedByReason: Record<RejectionReason, number>;

  addFiles: (files: readonly File[]) => void;
  addRejections: (rejected: readonly RejectedFile[]) => void;
  dismissRejections: () => void;
  pause: () => void;
  resume: () => void;
  cancel: (id: string) => void;
  cancelAll: () => void;
  retry: (id: string) => void;
  retryAllFailed: () => void;
  clearFinished: () => void;
};

export const useUploadStore = create<UploadStore>((set, get) => {
  /**
   * Fills any free slots and keeps the timer alive only while there is work.
   * Everything else in this store is a state transition; this is the only part
   * that starts I/O.
   */
  const pump = () => {
    const ready = pickNext(get().queue);

    for (const id of ready) {
      const item = get().queue.items.get(id);
      if (!item) continue;

      set((state) => ({ queue: markUploading(state.queue, id) }));

      const controller = new AbortController();
      controllers.set(id, controller);

      void uploadFile(item.file, {
        signal: controller.signal,
        onProgress: (fraction) => {
          set((state) => ({ queue: markProgress(state.queue, id, fraction) }));
        },
      })
        .then((summary) => {
          controllers.delete(id);
          set((state) => ({
            queue: markSucceeded(state.queue, id, summary.id),
            completedCount: state.completedCount + 1,
          }));
        })
        .catch((cause: unknown) => {
          controllers.delete(id);

          // A cancelled upload is not a failure — the operator asked for it.
          if (cause instanceof ApiError && cause.kind === 'aborted') return;

          set((state) => ({
            queue: markFailed(state.queue, id, describeUploadError(cause)),
          }));
        })
        .finally(pump);
    }

    syncTimer();
  };

  const syncTimer = () => {
    const { queue } = get();
    const summary = summarise(queue);
    const hasWork =
      summary.queued + summary.uploading + summary.retrying > 0 &&
      !queue.isPaused;

    if (hasWork && pumpTimer === null) {
      pumpTimer = setInterval(pump, PUMP_INTERVAL_MS);
    } else if (!hasWork && pumpTimer !== null) {
      clearInterval(pumpTimer);
      pumpTimer = null;
    }
  };

  return {
    queue: createQueue({
      maxParallel: clientEnv.NEXT_PUBLIC_MAX_PARALLEL_UPLOADS,
      maxAttempts: clientEnv.NEXT_PUBLIC_MAX_UPLOAD_ATTEMPTS,
    }),
    completedCount: 0,
    rejections: [],
    rejectedCount: 0,
    rejectedByReason: emptyRejectionTally(),

    addFiles: (files) => {
      if (files.length === 0) return;
      set((state) => ({
        queue: enqueue(state.queue, [...files], () => crypto.randomUUID()),
      }));
      pump();
    },

    addRejections: (rejected) => {
      if (rejected.length === 0) return;
      set((state) => {
        const byReason = { ...state.rejectedByReason };
        for (const file of rejected) byReason[file.reason] += 1;

        return {
          rejections: [...state.rejections, ...rejected].slice(
            0,
            MAX_REPORTED_REJECTIONS,
          ),
          rejectedCount: state.rejectedCount + rejected.length,
          rejectedByReason: byReason,
        };
      });
    },

    dismissRejections: () => {
      set({
        rejections: [],
        rejectedCount: 0,
        rejectedByReason: emptyRejectionTally(),
      });
    },

    pause: () => {
      set((state) => ({ queue: setPaused(state.queue, true) }));
      syncTimer();
    },

    resume: () => {
      set((state) => ({ queue: setPaused(state.queue, false) }));
      pump();
    },

    cancel: (id) => {
      controllers.get(id)?.abort();
      controllers.delete(id);
      set((state) => ({ queue: cancelItem(state.queue, id) }));
      pump();
    },

    cancelAll: () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
      set((state) => ({ queue: cancelAllItems(state.queue) }));
      syncTimer();
    },

    retry: (id) => {
      set((state) => ({ queue: retryItem(state.queue, id) }));
      pump();
    },

    retryAllFailed: () => {
      set((state) => ({ queue: retryAllFailedItems(state.queue) }));
      pump();
    },

    clearFinished: () => {
      set((state) => ({ queue: clearFinishedItems(state.queue) }));
    },
  };
});

function describeUploadError(cause: unknown): {
  message: string;
  retryable: boolean;
} {
  if (cause instanceof ApiError) {
    switch (cause.kind) {
      case 'network':
        return { message: cause.message, retryable: true };
      case 'http':
        // 4xx means the file itself is the problem; retrying sends the same
        // bytes to the same rejection. 5xx is worth another go.
        return {
          message: cause.message,
          retryable: cause.status !== null && cause.status >= 500,
        };
      case 'parse':
        return { message: cause.message, retryable: false };
      case 'aborted':
        return { message: cause.message, retryable: false };
    }
  }
  return { message: 'Upload failed unexpectedly', retryable: true };
}
