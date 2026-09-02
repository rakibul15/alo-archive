import { beforeEach, describe, expect, it } from 'vitest';
import { useUploadStore, type RejectedFile } from './store';

const reject = (
  name: string,
  reason: RejectedFile['reason'],
): RejectedFile => ({
  name,
  size: 1_024,
  reason,
});

beforeEach(() => {
  useUploadStore.getState().dismissRejections();
});

describe('rejection reporting', () => {
  it('caps the itemised list but keeps the totals exact', () => {
    // A field folder of 300 with 120 strays is not unusual, and the summary
    // has to stay truthful well past the point where listing every name stops
    // being useful.
    const many = Array.from({ length: 120 }, (_, i) =>
      reject(`stray_${i}.docx`, 'unsupported_type'),
    );
    useUploadStore.getState().addRejections(many);

    const state = useUploadStore.getState();
    expect(state.rejectedCount).toBe(120);
    expect(state.rejections.length).toBe(50);
    expect(state.rejectedByReason.unsupported_type).toBe(120);
  });

  it('breaks totals down by reason so the parts sum to the whole', () => {
    useUploadStore
      .getState()
      .addRejections([
        ...Array.from({ length: 55 }, (_, i) =>
          reject(`notes_${i}.docx`, 'unsupported_type'),
        ),
        reject('huge_scan.pdf', 'too_large'),
      ]);

    const { rejectedCount, rejectedByReason } = useUploadStore.getState();
    const summed = Object.values(rejectedByReason).reduce((a, b) => a + b, 0);

    // The regression this guards: the breakdown used to be counted off the
    // capped list, so 56 rejections reported as "49 unsupported, 1 too large".
    expect(rejectedCount).toBe(56);
    expect(summed).toBe(rejectedCount);
    expect(rejectedByReason.unsupported_type).toBe(55);
    expect(rejectedByReason.too_large).toBe(1);
  });

  it('accumulates across separate drops', () => {
    const store = useUploadStore.getState();
    store.addRejections([reject('a.docx', 'unsupported_type')]);
    store.addRejections([reject('b.zip', 'other')]);

    const state = useUploadStore.getState();
    expect(state.rejectedCount).toBe(2);
    expect(state.rejectedByReason.unsupported_type).toBe(1);
    expect(state.rejectedByReason.other).toBe(1);
  });

  it('resets every counter on dismiss', () => {
    useUploadStore
      .getState()
      .addRejections([reject('a.docx', 'unsupported_type')]);
    useUploadStore.getState().dismissRejections();

    const state = useUploadStore.getState();
    expect(state.rejectedCount).toBe(0);
    expect(state.rejections).toEqual([]);
    expect(state.rejectedByReason).toEqual({
      unsupported_type: 0,
      too_large: 0,
      other: 0,
    });
  });

  it('ignores an empty drop rather than churning state', () => {
    const before = useUploadStore.getState();
    before.addRejections([]);
    expect(useUploadStore.getState().rejections).toBe(before.rejections);
  });
});
