import { describe, expect, it } from 'vitest';
import {
  backoffDelay,
  cancelItem,
  clearFinished,
  createQueue,
  enqueue,
  markFailed,
  markProgress,
  markSucceeded,
  markUploading,
  pendingNames,
  pickNext,
  retryAllFailed,
  setPaused,
  summarise,
  type QueueState,
} from './queue';

const file = (name: string, size = 1_000): File =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });

function queueOf(count: number, size = 1_000): QueueState {
  const files = Array.from({ length: count }, (_, i) =>
    file(`f${i}.pdf`, size),
  );
  return enqueue(
    createQueue({ maxParallel: 3, maxAttempts: 3 }),
    files,
    (_, index) => `id-${index}`,
    0,
  );
}

describe('concurrency', () => {
  it('never starts more than maxParallel at once', () => {
    let state = queueOf(50);

    const first = pickNext(state, 0);
    expect(first).toHaveLength(3);

    for (const id of first) state = markUploading(state, id);
    // Every slot is busy, so nothing else may start.
    expect(pickNext(state, 0)).toEqual([]);

    const started = first[0];
    expect(started).toBeDefined();
    if (!started) return;

    state = markSucceeded(state, started, 'ALO-1');
    expect(pickNext(state, 0)).toHaveLength(1);
  });

  it('starts nothing while paused', () => {
    const state = setPaused(queueOf(10), true);
    expect(pickNext(state, 0)).toEqual([]);
  });

  it('resumes from where it stopped', () => {
    const paused = setPaused(queueOf(10), true);
    expect(pickNext(setPaused(paused, false), 0)).toHaveLength(3);
  });

  it('hands out work in the order files were dropped', () => {
    expect(pickNext(queueOf(10), 0)).toEqual(['id-0', 'id-1', 'id-2']);
  });
});

describe('retry and backoff', () => {
  it('waits out the backoff before trying again', () => {
    let state = queueOf(1);
    state = markUploading(state, 'id-0');
    state = markFailed(
      state,
      'id-0',
      { message: 'boom', retryable: true },
      1_000,
      () => 0.5,
    );

    const item = state.items.get('id-0');
    expect(item?.status).toBe('retrying');
    expect(item?.nextAttemptAt).toBeGreaterThan(1_000);

    // Too early: the slot stays empty rather than hammering the server.
    expect(pickNext(state, 1_100)).toEqual([]);
    expect(pickNext(state, item?.nextAttemptAt ?? 0)).toEqual(['id-0']);
  });

  it('gives up after maxAttempts and says so', () => {
    let state = queueOf(1);

    for (let attempt = 0; attempt < 3; attempt++) {
      state = markUploading(state, 'id-0');
      state = markFailed(
        state,
        'id-0',
        { message: 'boom', retryable: true },
        0,
        () => 0.5,
      );
    }

    const item = state.items.get('id-0');
    expect(item?.attempts).toBe(3);
    expect(item?.status).toBe('failed');
    expect(pickNext(state, 10_000_000)).toEqual([]);
  });

  it('does not retry a failure that cannot succeed', () => {
    let state = queueOf(1);
    state = markUploading(state, 'id-0');
    state = markFailed(state, 'id-0', {
      message: 'unsupported',
      retryable: false,
    });

    expect(state.items.get('id-0')?.status).toBe('failed');
    expect(state.items.get('id-0')?.attempts).toBe(1);
  });

  it('grows the delay and keeps it bounded', () => {
    const noJitter = () => 0.5;
    expect(backoffDelay(1, noJitter)).toBe(500);
    expect(backoffDelay(2, noJitter)).toBe(1_000);
    expect(backoffDelay(3, noJitter)).toBe(2_000);
    expect(backoffDelay(20, noJitter)).toBe(16_000);
  });

  it('jitters, so a blip does not resynchronise every retry', () => {
    // Without jitter all six in-flight uploads fail together and retry
    // together, recreating the load that caused the failure.
    expect(backoffDelay(4, () => 0)).not.toBe(backoffDelay(4, () => 1));
  });

  it('manual retry resets the attempt budget', () => {
    let state = queueOf(1);
    state = markUploading(state, 'id-0');
    state = markFailed(state, 'id-0', { message: 'x', retryable: false });
    state = retryAllFailed(state);

    expect(state.items.get('id-0')).toMatchObject({
      status: 'queued',
      attempts: 0,
      error: null,
    });
  });
});

describe('cancelling', () => {
  it('takes a cancelled file out of the queue without failing it', () => {
    let state = queueOf(5);
    state = cancelItem(state, 'id-1');

    expect(state.items.get('id-1')?.status).toBe('cancelled');
    expect(pickNext(state, 0)).toEqual(['id-0', 'id-2', 'id-3']);
  });

  it('leaves finished work alone', () => {
    let state = queueOf(2);
    state = markUploading(state, 'id-0');
    state = markSucceeded(state, 'id-0', 'ALO-1');
    state = cancelItem(state, 'id-0');
    expect(state.items.get('id-0')?.status).toBe('succeeded');
  });
});

describe('progress', () => {
  it('weights the batch by bytes, not by file count', () => {
    // One 9 MB file and one 1 MB file: finishing the small one is not half done.
    let state = enqueue(
      createQueue({ maxParallel: 2, maxAttempts: 3 }),
      [file('big.pdf', 9_000), file('small.pdf', 1_000)],
      (_, index) => `id-${index}`,
      0,
    );
    state = markUploading(state, 'id-1');
    state = markSucceeded(state, 'id-1', 'ALO-1');

    expect(summarise(state, 1_000).progress).toBeCloseTo(0.1, 5);
  });

  it('counts a partly uploaded file', () => {
    let state = queueOf(2, 1_000);
    state = markUploading(state, 'id-0');
    state = markProgress(state, 'id-0', 0.5);
    expect(summarise(state, 1_000).bytesDone).toBe(500);
  });

  it('ignores progress reported for a file that is not uploading', () => {
    const state = markProgress(queueOf(1), 'id-0', 0.9);
    expect(state.items.get('id-0')?.progress).toBe(0);
  });

  it('drops cancelled files from the denominator', () => {
    // Otherwise a batch the operator deliberately stopped reads as permanently
    // stuck at 60%.
    let state = queueOf(2, 1_000);
    state = markUploading(state, 'id-0');
    state = markSucceeded(state, 'id-0', 'ALO-1');
    state = cancelItem(state, 'id-1');

    const summary = summarise(state, 1_000);
    expect(summary.bytesTotal).toBe(1_000);
    expect(summary.progress).toBe(1);
    expect(summary.isFinished).toBe(true);
  });

  it('estimates time remaining once there is enough to go on', () => {
    let state = queueOf(2, 1_000);
    state = markUploading(state, 'id-0');
    state = markSucceeded(state, 'id-0', 'ALO-1');

    // 1000 bytes in 2s = 500 B/s, 1000 bytes left => ~2s.
    expect(summarise(state, 2_000).etaSeconds).toBe(2);
  });

  it('offers no estimate before it can make an honest one', () => {
    const state = queueOf(2);
    expect(summarise(state, 100).etaSeconds).toBeNull();
    expect(summarise(state, 100).throughput).toBeNull();
  });
});

describe('clearFinished', () => {
  it('keeps work in progress and forgets the rest', () => {
    let state = queueOf(3);
    state = markUploading(state, 'id-0');
    state = markSucceeded(state, 'id-0', 'ALO-1');
    state = markUploading(state, 'id-1');

    state = clearFinished(state);
    expect(state.order).toEqual(['id-1', 'id-2']);
    expect(state.items.has('id-0')).toBe(false);
  });
});

describe('pendingNames', () => {
  it('returns the names of queued, uploading and retrying items, in order', () => {
    let state = queueOf(3);
    state = markUploading(state, 'id-1');

    expect(pendingNames(state)).toEqual(['f0.pdf', 'f1.pdf', 'f2.pdf']);
  });

  it('excludes succeeded, failed and cancelled items', () => {
    let state = queueOf(4);
    state = markUploading(state, 'id-0');
    state = markSucceeded(state, 'id-0', 'ALO-1');
    state = markUploading(state, 'id-1');
    state = markFailed(state, 'id-1', { message: 'nope', retryable: false }, 0);
    state = cancelItem(state, 'id-2');

    expect(pendingNames(state)).toEqual(['f3.pdf']);
  });

  it('returns an empty list once nothing is pending', () => {
    expect(
      pendingNames(createQueue({ maxParallel: 3, maxAttempts: 3 })),
    ).toEqual([]);
  });
});
