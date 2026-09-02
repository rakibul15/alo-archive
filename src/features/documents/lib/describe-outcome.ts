import {
  ERROR_CATALOGUE,
  PROCESSING_ERROR_CODES,
  type RetryOutcome,
} from '@/lib/domain/document';

const numberFormat = new Intl.NumberFormat('en-GB');

/** Turns the counts into something an operator can act on. */
export function describeOutcome(outcome: RetryOutcome): {
  title: string;
  description: string | undefined;
} {
  // Iterating the enum rather than Object.entries keeps the key typed, so no
  // cast is needed to look up the catalogue.
  const reasons = PROCESSING_ERROR_CODES.filter(
    (code) => outcome.refusedByCode[code] > 0,
  ).map(
    (code) =>
      `${numberFormat.format(outcome.refusedByCode[code])} ${ERROR_CATALOGUE[code].title.toLowerCase()}`,
  );

  if (outcome.retried === 0 && outcome.refused > 0) {
    return {
      title: 'Nothing could be retried',
      description: `${reasons.join(', ')}. These need the file itself to change.`,
    };
  }

  const parts: string[] = [];
  if (outcome.refused > 0) {
    parts.push(
      `${numberFormat.format(outcome.refused)} cannot be retried (${reasons.join(', ')})`,
    );
  }
  if (outcome.notFailed > 0) {
    parts.push(
      `${numberFormat.format(outcome.notFailed)} were not in a failed state`,
    );
  }

  return {
    title: `${numberFormat.format(outcome.retried)} document${outcome.retried === 1 ? '' : 's'} re-queued`,
    description: parts.length > 0 ? `${parts.join('. ')}.` : undefined,
  };
}
