'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';

/**
 * Route-level boundary — the outermost of the three tiers.
 *
 * Nothing in the *domain* should reach here: a failed document is a row with a
 * status, not an exception. If this renders, something genuinely unexpected
 * broke.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            This page failed to render. Nothing in the archive has been lost.
            {error.digest ? ` Reference: ${error.digest}` : ''}
          </EmptyDescription>
        </EmptyHeader>
        {/*
          `retry()` (stable since Next 16.3.0) re-fetches and re-renders the
          boundary's children in a transition rather than just clearing local
          error state, so it can actually recover from a transient failure
          instead of immediately re-throwing the same one. `reset` is still
          supported but is now the fallback for callers that specifically want
          state cleared without a re-fetch — not what we want here.
        */}
        <Button onClick={retry}>Try again</Button>
      </Empty>
    </main>
  );
}
