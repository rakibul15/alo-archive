'use client';

import { RotateCcwIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * Appears only when something is selected, and says plainly what the next
 * action will touch. The count can be six figures, so it is never phrased as
 * "these documents" — the number is the point.
 */
export function BulkActionsBar({
  count,
  matchedCount,
  isAllMatching,
  isRetrying,
  onRetry,
  onSelectAllMatching,
  onClear,
}: {
  count: number;
  matchedCount: number;
  isAllMatching: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onSelectAllMatching: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2"
      role="region"
      aria-label="Bulk actions"
    >
      <p className="text-sm font-medium" aria-live="polite">
        {numberFormat.format(count)} selected
      </p>

      {!isAllMatching && count < matchedCount ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={onSelectAllMatching}
        >
          Select all {numberFormat.format(matchedCount)} matching
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? <Spinner /> : <RotateCcwIcon aria-hidden />}
          Retry failed
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <XIcon aria-hidden />
          Clear
        </Button>
      </div>
    </div>
  );
}
