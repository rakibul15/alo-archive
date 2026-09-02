/**
 * The upload queue, as a pure state machine.
 *
 * Deliberately free of React and of `fetch`: the interesting behaviour here is
 * scheduling — how many uploads run at once, when a failure is worth another
 * attempt, how long to wait before it — and none of that should need a rendered
 * component or a network stack to test. The Zustand store in `../store.ts` is a
 * thin shell around these functions, and `../lib/chunked-upload.ts` does the I/O.
 */

export type UploadItemStatus =
  /** Waiting for a slot. */
  | 'queued'
  /** Waiting out a backoff delay before another attempt. */
  | 'retrying'
  | 'uploading'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type UploadError = {
  message: string;
  /** Whether another attempt could plausibly do better. */
  retryable: boolean;
};

export type UploadItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  status: UploadItemStatus;
  /** 0–1, from real XHR upload progress events. */
  progress: number;
  attempts: number;
  error: UploadError | null;
  /** Set once the server has accepted the file. */
  documentId: string | null;
  /** Epoch ms; only meaningful while `retrying`. */
  nextAttemptAt: number | null;
};

export type QueueState = {
  items: Map<string, UploadItem>;
  /** Insertion order, so the panel is stable while items change status. */
  order: string[];
  isPaused: boolean;
  maxParallel: number;
  maxAttempts: number;
  /** When the current run began, for the throughput estimate. */
  startedAt: number | null;
};

export function createQueue(options: {
  maxParallel: number;
  maxAttempts: number;
}): QueueState {
  return {
    items: new Map(),
    order: [],
    isPaused: false,
    maxParallel: options.maxParallel,
    maxAttempts: options.maxAttempts,
    startedAt: null,
  };
}

const ACTIVE_STATUSES: readonly UploadItemStatus[] = [
  'queued',
  'retrying',
  'uploading',
];

export function isActive(item: UploadItem): boolean {
  return ACTIVE_STATUSES.includes(item.status);
}

/* -------------------------------------------------------------------------
 * Transitions
 *
 * Each returns a new state; the Map and the changed item are copied, the rest
 * is shared. Cloning the whole queue on every progress tick would be its own
 * performance problem at five thousand files.
 * ---------------------------------------------------------------------- */

function withItem(state: QueueState, item: UploadItem): QueueState {
  const items = new Map(state.items);
  items.set(item.id, item);
  return { ...state, items };
}

export function enqueue(
  state: QueueState,
  files: readonly File[],
  makeId: (file: File, index: number) => string,
  now = Date.now(),
): QueueState {
  if (files.length === 0) return state;

  const items = new Map(state.items);
  const order = [...state.order];

  files.forEach((file, index) => {
    const id = makeId(file, index);
    items.set(id, {
      id,
      file,
      name: file.name,
      size: file.size,
      status: 'queued',
      progress: 0,
      attempts: 0,
      error: null,
      documentId: null,
      nextAttemptAt: null,
    });
    order.push(id);
  });

  return {
    ...state,
    items,
    order,
    startedAt: state.startedAt ?? now,
  };
}

export function markUploading(state: QueueState, id: string): QueueState {
  const item = state.items.get(id);
  if (!item) return state;
  return withItem(state, {
    ...item,
    status: 'uploading',
    attempts: item.attempts + 1,
    progress: 0,
    error: null,
    nextAttemptAt: null,
  });
}

export function markProgress(
  state: QueueState,
  id: string,
  progress: number,
): QueueState {
  const item = state.items.get(id);
  if (!item || item.status !== 'uploading') return state;
  return withItem(state, {
    ...item,
    progress: Math.min(Math.max(progress, 0), 1),
  });
}

export function markSucceeded(
  state: QueueState,
  id: string,
  documentId: string,
): QueueState {
  const item = state.items.get(id);
  if (!item) return state;
  return withItem(state, {
    ...item,
    status: 'succeeded',
    progress: 1,
    documentId,
    error: null,
    nextAttemptAt: null,
  });
}

/**
 * Exponential backoff with jitter.
 *
 * The jitter matters more than the exponent here: when an ingest service blips,
 * every in-flight upload fails at the same instant, and without jitter all six
 * retry at the same instant too — reproducing the load that caused the failure.
 */
export function backoffDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(500 * 2 ** (attempt - 1), 16_000);
  return Math.round(base * (0.7 + random() * 0.6));
}

export function markFailed(
  state: QueueState,
  id: string,
  error: UploadError,
  now = Date.now(),
  random: () => number = Math.random,
): QueueState {
  const item = state.items.get(id);
  if (!item) return state;

  const canRetry = error.retryable && item.attempts < state.maxAttempts;

  return withItem(state, {
    ...item,
    status: canRetry ? 'retrying' : 'failed',
    error,
    nextAttemptAt: canRetry ? now + backoffDelay(item.attempts, random) : null,
  });
}

/** Manual retry: resets the attempt budget, because a human asked. */
export function retryItem(state: QueueState, id: string): QueueState {
  const item = state.items.get(id);
  if (!item || item.status !== 'failed') return state;
  return withItem(state, {
    ...item,
    status: 'queued',
    attempts: 0,
    error: null,
    progress: 0,
    nextAttemptAt: null,
  });
}

export function retryAllFailed(state: QueueState): QueueState {
  let next = state;
  for (const id of state.order) {
    if (state.items.get(id)?.status === 'failed') next = retryItem(next, id);
  }
  return next;
}

export function cancelItem(state: QueueState, id: string): QueueState {
  const item = state.items.get(id);
  if (!item || !isActive(item)) return state;
  return withItem(state, {
    ...item,
    status: 'cancelled',
    nextAttemptAt: null,
  });
}

export function cancelAll(state: QueueState): QueueState {
  let next = state;
  for (const id of state.order) {
    const item = next.items.get(id);
    if (item && isActive(item)) next = cancelItem(next, id);
  }
  return next;
}

export function setPaused(state: QueueState, isPaused: boolean): QueueState {
  return { ...state, isPaused };
}

/** Clears everything terminal, leaving work in progress alone. */
export function clearFinished(state: QueueState): QueueState {
  const items = new Map(state.items);
  const order: string[] = [];

  for (const id of state.order) {
    const item = items.get(id);
    if (!item) continue;
    if (isActive(item)) {
      order.push(id);
    } else {
      items.delete(id);
    }
  }

  return {
    ...state,
    items,
    order,
    startedAt: order.length > 0 ? state.startedAt : null,
  };
}

/* -------------------------------------------------------------------------
 * Scheduling
 * ---------------------------------------------------------------------- */

export function inFlightCount(state: QueueState): number {
  let count = 0;
  for (const item of state.items.values()) {
    if (item.status === 'uploading') count += 1;
  }
  return count;
}

/**
 * Which items should start right now.
 *
 * The concurrency cap is the whole point: dropping five thousand files must not
 * open five thousand requests. Browsers cap connections per origin anyway, but
 * relying on that means five thousand pending XHRs, five thousand progress
 * listeners, and no way to pause.
 */
export function pickNext(state: QueueState, now = Date.now()): string[] {
  if (state.isPaused) return [];

  const slots = state.maxParallel - inFlightCount(state);
  if (slots <= 0) return [];

  const ready: string[] = [];
  for (const id of state.order) {
    if (ready.length >= slots) break;
    const item = state.items.get(id);
    if (!item) continue;
    if (item.status === 'queued') {
      ready.push(id);
    } else if (item.status === 'retrying' && (item.nextAttemptAt ?? 0) <= now) {
      ready.push(id);
    }
  }
  return ready;
}

/* -------------------------------------------------------------------------
 * Aggregates
 * ---------------------------------------------------------------------- */

export type QueueSummary = {
  total: number;
  queued: number;
  uploading: number;
  retrying: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  /** 0–1 across the whole batch, weighted by bytes rather than file count. */
  progress: number;
  bytesTotal: number;
  bytesDone: number;
  /** Bytes per second over the run so far; null until there is enough to say. */
  throughput: number | null;
  /** Seconds, or null when it cannot be estimated honestly. */
  etaSeconds: number | null;
  isFinished: boolean;
};

export function summarise(state: QueueState, now = Date.now()): QueueSummary {
  const summary = {
    total: state.order.length,
    queued: 0,
    uploading: 0,
    retrying: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    bytesTotal: 0,
    bytesDone: 0,
  };

  for (const item of state.items.values()) {
    summary[item.status] += 1;
    // Cancelled files are removed from the denominator — leaving them in makes
    // a batch the operator deliberately stopped look permanently incomplete.
    if (item.status === 'cancelled') continue;
    summary.bytesTotal += item.size;
    summary.bytesDone +=
      item.status === 'succeeded' ? item.size : item.size * item.progress;
  }

  const elapsedSeconds =
    state.startedAt === null ? 0 : (now - state.startedAt) / 1000;
  const throughput =
    elapsedSeconds > 1 && summary.bytesDone > 0
      ? summary.bytesDone / elapsedSeconds
      : null;

  const bytesLeft = summary.bytesTotal - summary.bytesDone;
  const active = summary.queued + summary.uploading + summary.retrying;

  return {
    ...summary,
    progress:
      summary.bytesTotal === 0 ? 0 : summary.bytesDone / summary.bytesTotal,
    throughput,
    etaSeconds:
      throughput !== null && bytesLeft > 0 && active > 0
        ? Math.round(bytesLeft / throughput)
        : null,
    isFinished: state.order.length > 0 && active === 0,
  };
}
