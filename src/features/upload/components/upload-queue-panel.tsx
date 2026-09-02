'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CheckCircle2Icon,
  ClockIcon,
  LoaderIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
  XCircleIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatBytes, formatDuration } from '../lib/format';
import {
  summarise,
  type UploadItem,
  type UploadItemStatus,
} from '../lib/queue';
import { useUploadStore } from '../store';

const ROW_HEIGHT = 60;
const numberFormat = new Intl.NumberFormat('en-GB');
const percentFormat = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** Same rule as the document table: never colour alone, always a glyph too. */
const ITEM_CONFIG = {
  queued: {
    label: 'Waiting',
    icon: ClockIcon,
    className: 'text-status-pending',
  },
  retrying: {
    label: 'Retrying',
    icon: RotateCcwIcon,
    className: 'text-status-needs-review',
  },
  uploading: {
    label: 'Uploading',
    icon: LoaderIcon,
    className: 'text-status-uploading',
  },
  succeeded: {
    label: 'Uploaded',
    icon: CheckCircle2Icon,
    className: 'text-status-completed',
  },
  failed: {
    label: 'Failed',
    icon: XCircleIcon,
    className: 'text-status-failed',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XIcon,
    className: 'text-muted-foreground',
  },
} as const satisfies Record<
  UploadItemStatus,
  { label: string; icon: LucideIcon; className: string }
>;

export function UploadQueuePanel() {
  const queue = useUploadStore((state) => state.queue);
  const pause = useUploadStore((state) => state.pause);
  const resume = useUploadStore((state) => state.resume);
  const cancelAll = useUploadStore((state) => state.cancelAll);
  const retryAllFailed = useUploadStore((state) => state.retryAllFailed);
  const clearFinished = useUploadStore((state) => state.clearFinished);

  const scrollRef = useRef<HTMLDivElement>(null);
  const summary = summarise(queue);

  // eslint-disable-next-line react-hooks/incompatible-library -- see documents-table.tsx
  const virtualizer = useVirtualizer({
    count: queue.order.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (queue.order.length === 0) return null;

  const active = summary.queued + summary.uploading + summary.retrying;

  return (
    <section
      aria-labelledby="upload-queue-heading"
      className="flex min-h-0 flex-1 flex-col rounded-xl border border-border"
    >
      <header className="space-y-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="upload-queue-heading" className="text-sm font-medium">
            {summary.isFinished
              ? 'Upload complete'
              : `Uploading ${numberFormat.format(active)} of ${numberFormat.format(summary.total)}`}
          </h2>

          <div className="flex items-center gap-2">
            {active > 0 ? (
              queue.isPaused ? (
                <Button size="sm" variant="outline" onClick={resume}>
                  <PlayIcon aria-hidden />
                  Resume
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={pause}>
                  <PauseIcon aria-hidden />
                  Pause
                </Button>
              )
            ) : null}

            {summary.failed > 0 ? (
              <Button size="sm" variant="outline" onClick={retryAllFailed}>
                <RotateCcwIcon aria-hidden />
                Retry {numberFormat.format(summary.failed)} failed
              </Button>
            ) : null}

            {active > 0 ? (
              <Button size="sm" variant="ghost" onClick={cancelAll}>
                Cancel all
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={clearFinished}>
                <Trash2Icon aria-hidden />
                Clear
              </Button>
            )}
          </div>
        </div>

        <Progress
          value={summary.progress * 100}
          aria-label="Overall upload progress"
        />

        {/*
          One polite live region for the batch rather than one per row: five
          thousand rows each announcing themselves is not accessibility, it is a
          denial of service on the screen reader.
        */}
        <p
          className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span>{percentFormat.format(summary.progress)}</span>
          <span>
            {formatBytes(summary.bytesDone)} of{' '}
            {formatBytes(summary.bytesTotal)}
          </span>
          {summary.succeeded > 0 ? (
            <span className="text-status-completed">
              {numberFormat.format(summary.succeeded)} uploaded
            </span>
          ) : null}
          {summary.failed > 0 ? (
            <span className="text-status-failed">
              {numberFormat.format(summary.failed)} failed
            </span>
          ) : null}
          {summary.cancelled > 0 ? (
            <span>{numberFormat.format(summary.cancelled)} cancelled</span>
          ) : null}
          {summary.throughput !== null && active > 0 ? (
            <span>{formatBytes(summary.throughput)}/s</span>
          ) : null}
          {summary.etaSeconds !== null ? (
            <span>{formatDuration(summary.etaSeconds)} remaining</span>
          ) : null}
          {queue.isPaused && active > 0 ? <span>Paused</span> : null}
        </p>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div
          style={{ height: virtualizer.getTotalSize() }}
          className="relative w-full"
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const id = queue.order[virtualRow.index];
            const item = id === undefined ? undefined : queue.items.get(id);
            if (!item) return null;

            return (
              <UploadRow
                key={item.id}
                item={item}
                height={virtualRow.size}
                offset={virtualRow.start}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function UploadRow({
  item,
  height,
  offset,
}: {
  item: UploadItem;
  height: number;
  offset: number;
}) {
  const cancel = useUploadStore((state) => state.cancel);
  const retry = useUploadStore((state) => state.retry);

  const config = ITEM_CONFIG[item.status];
  const Icon = config.icon;
  const isActive =
    item.status === 'uploading' ||
    item.status === 'queued' ||
    item.status === 'retrying';

  return (
    <div
      className="absolute inset-x-0 flex items-center gap-3 border-b border-border px-4"
      style={{ height, transform: `translateY(${offset}px)` }}
    >
      <Icon
        aria-hidden
        className={cn(
          'size-4 shrink-0',
          config.className,
          item.status === 'uploading' && 'animate-spin',
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatBytes(item.size)} ·{' '}
          <span className={config.className}>{config.label}</span>
          {item.status === 'uploading' && item.progress > 0
            ? ` · ${percentFormat.format(item.progress)}`
            : ''}
          {item.status === 'retrying' ? ` · attempt ${item.attempts + 1}` : ''}
          {item.error ? ` · ${item.error.message}` : ''}
        </p>
      </div>

      {item.status === 'uploading' ? (
        <Progress
          value={item.progress * 100}
          className="hidden w-24 sm:block"
        />
      ) : null}

      {item.status === 'failed' ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            retry(item.id);
          }}
        >
          <RotateCcwIcon aria-hidden />
          <span className="sr-only">Retry {item.name}</span>
        </Button>
      ) : null}

      {isActive ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            cancel(item.id);
          }}
        >
          <XIcon aria-hidden />
          <span className="sr-only">Cancel {item.name}</span>
        </Button>
      ) : null}
    </div>
  );
}
