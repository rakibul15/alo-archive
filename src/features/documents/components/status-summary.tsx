'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DOCUMENT_STATUSES } from '@/lib/domain/document';
import { STATUS_CONFIG } from '@/lib/domain/status-config';
import { archiveSummaryOptions } from '../api/queries';
import { useArchiveStream } from '../hooks/use-archive-stream';

const numberFormat = new Intl.NumberFormat('en-GB');

export function StatusSummary() {
  useArchiveStream();
  const { data, isPending, isError } = useQuery(archiveSummaryOptions());

  return (
    <section aria-labelledby="pipeline-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pipeline-heading" className="text-lg font-semibold">
          Processing pipeline
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {data
            ? `${numberFormat.format(data.totalCount)} documents in the archive` +
              (data.throughput > 0
                ? ` · ${data.throughput.toFixed(1)}/s completing`
                : '')
            : ' '}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {DOCUMENT_STATUSES.map((status) => {
          const config = STATUS_CONFIG[status];
          const Icon = config.icon;
          const count = data?.counts[status] ?? 0;
          return (
            <li key={status}>
              {/*
                Each tile links into the filtered list rather than being a
                decorative counter — seeing "174 failed" and not being able to
                click through to those 174 is the most obvious thing to want.
              */}
              <Link
                href={`/documents?status=${status}`}
                className={cn(
                  'block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  count === 0 && 'opacity-60',
                )}
              >
                <Card className={cn('gap-2 border p-4', config.className)}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {config.label}
                  </div>
                  {isPending ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-semibold text-foreground tabular-nums">
                      {isError ? '—' : numberFormat.format(count)}
                    </p>
                  )}
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
