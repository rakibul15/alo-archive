'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { describeError, isRetryable } from '@/lib/api/errors';
import {
  ERROR_CATALOGUE,
  PROCESSING_ERROR_CODES,
  type DocumentRecord,
  type ExtractedFieldKey,
  type RetryOutcome,
} from '@/lib/domain/document';
import { correctField, retryDocuments } from '../api/mutations';
import { documentKeys } from '../api/keys';

const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * Exponential backoff with a ceiling, applied only to failures that could
 * plausibly succeed on a second attempt. `isRetryable` is the same predicate
 * the UI uses to decide whether to show a retry button, so the automatic and
 * the manual paths can never disagree about what is worth retrying.
 */
const backoff = {
  retry: (attempt: number, error: unknown) => attempt < 3 && isRetryable(error),
  retryDelay: (attempt: number) => Math.min(500 * 2 ** attempt, 8_000),
};

/** Turns the counts into something an operator can act on. */
function describeOutcome(outcome: RetryOutcome): {
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

export function useRetryDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryDocuments,
    ...backoff,
    onSuccess: (outcome) => {
      const { title, description } = describeOutcome(outcome);
      if (outcome.retried === 0) {
        toast.warning(title, { description });
      } else {
        toast.success(title, { description });
      }
      // Rows change status server-side, and at this scale re-reading the page
      // is cheaper and more honest than patching an unknown number of cached
      // entries by hand.
      void queryClient.invalidateQueries({ queryKey: documentKeys.all });
    },
    onError: (error) => {
      const { title, detail } = describeError(error);
      toast.error(title, { description: detail });
    },
  });
}

export function useCorrectField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: correctField,
    ...backoff,
    onSuccess: (record, variables) => {
      // The server returns the whole updated record, so the open panel can be
      // written directly rather than made to flicker through a refetch.
      queryClient.setQueryData<DocumentRecord>(
        documentKeys.detail(variables.id),
        record,
      );

      if (record.status === 'completed') {
        toast.success('Document cleared for use', {
          description:
            'Every field is now trusted, so it has left the review queue.',
        });
      }

      void queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: documentKeys.summary() });
    },
    onError: (error) => {
      const { title, detail } = describeError(error);
      toast.error(title, { description: detail });
    },
  });
}

export type CorrectFieldInput = {
  id: string;
  field: ExtractedFieldKey;
  value: string;
};
