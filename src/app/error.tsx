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
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
        <Button onClick={reset}>Try again</Button>
      </Empty>
    </main>
  );
}
