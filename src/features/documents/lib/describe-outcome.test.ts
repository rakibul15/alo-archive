import { describe, expect, it } from 'vitest';
import { emptyRetryOutcome, type RetryOutcome } from '@/lib/domain/document';
import { describeOutcome } from './describe-outcome';

function outcome(overrides: Partial<RetryOutcome>): RetryOutcome {
  return { ...emptyRetryOutcome(), ...overrides };
}

describe('describeOutcome', () => {
  it('reports nothing retried when everything was refused', () => {
    const result = describeOutcome(
      outcome({
        refused: 2,
        refusedByCode: {
          ...emptyRetryOutcome().refusedByCode,
          PASSWORD_PROTECTED: 2,
        },
      }),
    );
    expect(result.title).toBe('Nothing could be retried');
    expect(result.description).toBe(
      '2 password protected. These need the file itself to change.',
    );
  });

  it('uses singular wording for exactly one retried document', () => {
    const result = describeOutcome(outcome({ retried: 1 }));
    expect(result.title).toBe('1 document re-queued');
    expect(result.description).toBeUndefined();
  });

  it('uses plural wording and no description when nothing else happened', () => {
    const result = describeOutcome(outcome({ retried: 5 }));
    expect(result.title).toBe('5 documents re-queued');
    expect(result.description).toBeUndefined();
  });

  it('mentions refused documents alongside retried ones', () => {
    const result = describeOutcome(
      outcome({
        retried: 3,
        refused: 1,
        refusedByCode: {
          ...emptyRetryOutcome().refusedByCode,
          CORRUPT_FILE: 1,
        },
      }),
    );
    expect(result.title).toBe('3 documents re-queued');
    expect(result.description).toBe(
      '1 cannot be retried (1 file is unreadable).',
    );
  });

  it('mentions documents that were not in a failed state', () => {
    const result = describeOutcome(outcome({ retried: 2, notFailed: 4 }));
    expect(result.description).toBe('4 were not in a failed state.');
  });

  it('joins refused and not-failed reasons when both apply', () => {
    const result = describeOutcome(
      outcome({
        retried: 1,
        refused: 1,
        notFailed: 1,
        refusedByCode: {
          ...emptyRetryOutcome().refusedByCode,
          OCR_TIMEOUT: 1,
        },
      }),
    );
    expect(result.description).toBe(
      '1 cannot be retried (1 processing timed out). 1 were not in a failed state.',
    );
  });

  it('handles a completely empty outcome', () => {
    const result = describeOutcome(outcome({}));
    expect(result.title).toBe('0 documents re-queued');
    expect(result.description).toBeUndefined();
  });
});
