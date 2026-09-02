'use client';

import { useCallback, useRef } from 'react';
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { describeError, isRetryable } from '@/lib/api/errors';
import type { DocumentRecord, ExtractedFieldKey } from '@/lib/domain/document';
import { correctField, retryDocuments } from '../api/mutations';
import { documentKeys } from '../api/keys';
import { describeOutcome } from '../lib/describe-outcome';

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

/**
 * Wraps `mutate` so clicks queued before React re-renders can't fire a
 * duplicate request.
 *
 * `isPending` is state: it only reflects reality after the next render, and a
 * real double-click (or three) queues every call before any of them sees
 * `isPending: true`. QA confirmed this concretely — three rapid clicks on
 * retry, on field-correction confirm, and on bulk retry each fired three
 * network requests, not one. Nothing was corrupted (the server happens to be
 * idempotent for these two operations), but that safety net was incidental,
 * not designed in, and doesn't hold for every mutation forever. This lock is
 * a plain ref, checked and set synchronously, so it closes the gap regardless
 * of render timing rather than depending on server-side luck.
 */
function useSingleFlight<TVariables, TData, TError>(
  mutation: Pick<UseMutationResult<TData, TError, TVariables>, 'mutate'>,
): (
  variables: TVariables,
  options?: Parameters<typeof mutation.mutate>[1],
) => void {
  const inFlight = useRef(false);
  return useCallback(
    // Callers here (field correction) also pass a per-call `onSuccess` to
    // close their own editing state, so this has to forward that second
    // argument rather than swallow it — it merges in the lock release
    // alongside whatever the caller already asked for.
    (
      variables: TVariables,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      mutation.mutate(variables, {
        ...options,
        onSettled: (...args) => {
          inFlight.current = false;
          options?.onSettled?.(...args);
        },
      });
    },
    [mutation],
  );
}

export function useRetryDocuments() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
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

  const mutate = useSingleFlight(mutation);
  return { ...mutation, mutate };
}

export function useCorrectField() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
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

  const mutate = useSingleFlight(mutation);
  return { ...mutation, mutate };
}

export type CorrectFieldInput = {
  id: string;
  field: ExtractedFieldKey;
  value: string;
};
