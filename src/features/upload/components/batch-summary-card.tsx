'use client';

import Link from 'next/link';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { summarise } from '../lib/queue';
import { useUploadStore } from '../store';

const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * What actually happened, once the batch stops moving.
 *
 * A progress bar that reaches 100% and then just sits there is not an outcome —
 * it leaves the operator to work out for themselves whether anything failed. A
 * batch ends with a statement and the two things they might want next: retry
 * what broke, or go and look at what arrived.
 */
export function BatchSummaryCard() {
  const queue = useUploadStore((state) => state.queue);
  const retryAllFailed = useUploadStore((state) => state.retryAllFailed);
  const clearFinished = useUploadStore((state) => state.clearFinished);

  const summary = summarise(queue);
  if (!summary.isFinished) return null;

  const hasFailures = summary.failed > 0;

  return (
    <Card
      className={cn(
        'flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between',
        hasFailures
          ? 'border-status-needs-review/30 bg-status-needs-review/5'
          : 'border-status-completed/30 bg-status-completed/5',
      )}
      // Announced once, when it appears — not on every tick of the progress bar.
      role="status"
    >
      <div className="flex items-start gap-3">
        {hasFailures ? (
          <TriangleAlertIcon
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-status-needs-review"
          />
        ) : (
          <CheckCircle2Icon
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-status-completed"
          />
        )}
        <div className="space-y-1">
          <h2 className="text-sm font-medium">
            {hasFailures ? 'Batch finished with failures' : 'Batch complete'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {numberFormat.format(summary.succeeded)} accepted
            {hasFailures
              ? ` · ${numberFormat.format(summary.failed)} failed`
              : ''}
            {summary.cancelled > 0
              ? ` · ${numberFormat.format(summary.cancelled)} cancelled`
              : ''}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {hasFailures ? (
          <Button size="sm" variant="outline" onClick={retryAllFailed}>
            <RotateCcwIcon aria-hidden />
            Retry {numberFormat.format(summary.failed)}
          </Button>
        ) : null}
        {summary.succeeded > 0 ? (
          <Button size="sm" asChild>
            <Link href="/documents">
              See them in the archive
              <ArrowRightIcon aria-hidden />
            </Link>
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={clearFinished}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
