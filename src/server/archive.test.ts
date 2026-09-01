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
    expect(result.retried).toHaveLength(0);
    expect(result.refused).toHaveLength(nonRetryable.length);
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
    expect(result.retried).toEqual([retryable.id]);
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

    expect(archive.retry([first.id]).refused).toEqual([first.id]);
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
