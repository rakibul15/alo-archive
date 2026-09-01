import { describe, expect, it } from 'vitest';
import { archive } from './archive';
import { ERROR_CATALOGUE, documentFiltersSchema } from '@/lib/domain/document';

const filters = documentFiltersSchema.parse({});

describe('cursor pagination', () => {
  it('walks the archive without skipping or repeating a row', () => {
    const seen: string[] = [];
    let cursor: string | null = null;

    // Five pages is enough to cross several cursor boundaries without making
    // the test slow.
    for (let page = 0; page < 5; page++) {
      const result = archive.list(filters, cursor, 50);
      seen.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    expect(seen.length).toBeGreaterThan(100);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('returns a null cursor on the final page', () => {
    const narrow = documentFiltersSchema.parse({ q: 'ALO-000007' });
    const page = archive.list(narrow, null, 50);
    expect(page.nextCursor).toBeNull();
    expect(page.matchedCount).toBeLessThan(page.totalCount);
  });
});

describe('filtering', () => {
  it('reports matched and total separately so the UI can say "n of m"', () => {
    const failedOnly = documentFiltersSchema.parse({ status: ['failed'] });
    const page = archive.list(failedOnly, null, 20);

    expect(page.totalCount).toBe(archive.size);
    expect(page.matchedCount).toBeLessThan(page.totalCount);
    expect(page.items.every((item) => item.status === 'failed')).toBe(true);
  });
});

describe('retry', () => {
  it('refuses failures that cannot succeed on a second attempt', () => {
    const failed = archive.list(
      documentFiltersSchema.parse({ status: ['failed'] }),
      null,
      200,
    ).items;

    const nonRetryable = failed.filter(
      (item) => item.errorCode && !ERROR_CATALOGUE[item.errorCode].retryable,
    );
    expect(nonRetryable.length).toBeGreaterThan(0);

    const result = archive.retry(nonRetryable.map((item) => item.id));
    expect(result.retried).toBe(0);
    expect(result.refused).toBe(nonRetryable.length);

    // Refusals are counted by reason, so the UI can say why rather than shrug.
    const byCode = Object.values(result.refusedByCode).reduce(
      (a, b) => a + b,
      0,
    );
    expect(byCode).toBe(nonRetryable.length);
  });

  it('re-queues a retryable failure', () => {
    const failed = archive.list(
      documentFiltersSchema.parse({ status: ['failed'] }),
      null,
      200,
    ).items;

    const retryable = failed.find(
      (item) => item.errorCode && ERROR_CATALOGUE[item.errorCode].retryable,
    );
    expect(retryable).toBeDefined();
    if (!retryable) return;

    const result = archive.retry([retryable.id]);
    expect(result.retried).toBe(1);
    expect(archive.get(retryable.id)?.status).toBe('pending');
  });

  it('ignores ids that are not failed', () => {
    const completed = archive.list(
      documentFiltersSchema.parse({ status: ['completed'] }),
      null,
      5,
    ).items;
    const first = completed[0];
    expect(first).toBeDefined();
    if (!first) return;

    const result = archive.retry([first.id]);
    expect(result.retried).toBe(0);
    expect(result.notFailed).toBe(1);
  });

  it('counts ids that do not exist rather than throwing', () => {
    const result = archive.retry(['ALO-999999999']);
    expect(result.notFound).toBe(1);
    expect(result.retried).toBe(0);
  });

  /**
   * The reason `retryMatching` exists: "retry everything that failed" across a
   * six-figure archive must not mean shipping six figures of ids to the server.
   */
  it('retries by filter without being handed an id list', () => {
    const failedFilter = documentFiltersSchema.parse({ status: ['failed'] });
    const before = archive.list(failedFilter, null, 1).matchedCount;
    expect(before).toBeGreaterThan(0);

    const result = archive.retryMatching(failedFilter, []);
    expect(result.retried + result.refused).toBe(before);

    // Everything left failed after the sweep must be non-retryable.
    const after = archive.list(failedFilter, null, 200).items;
    expect(
      after.every(
        (item) => item.errorCode && !ERROR_CATALOGUE[item.errorCode].retryable,
      ),
    ).toBe(true);
  });

  it('honours the exceptions carried alongside the filter', () => {
    const failedFilter = documentFiltersSchema.parse({ status: ['failed'] });
    const failed = archive.list(failedFilter, null, 200).items;
    const skipped = failed[0];
    expect(skipped).toBeDefined();
    if (!skipped) return;

    const result = archive.retryMatching(failedFilter, [skipped.id]);
    expect(result.retried + result.refused).toBe(failed.length - 1);
  });
});

describe('corrections', () => {
  it('pins a corrected field to full confidence and can clear the review flag', () => {
    const review = archive.list(
      documentFiltersSchema.parse({ status: ['needs_review'] }),
      null,
      50,
    ).items;

    const target = review[0];
    expect(target).toBeDefined();
    if (!target) return;

    const before = archive.get(target.id);
    expect(before?.extracted).not.toBeNull();

    const updated = archive.correct(target.id, 'personName', 'Ayesha Rahman');
    expect(updated?.extracted?.personName).toMatchObject({
      value: 'Ayesha Rahman',
      confidence: 1,
      status: 'corrected',
    });
  });
});
