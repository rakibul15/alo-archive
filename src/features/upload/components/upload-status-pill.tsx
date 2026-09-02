'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LoaderIcon, PauseIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '../lib/format';
import { summarise } from '../lib/queue';
import { useUploadStore } from '../store';

const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * Upload progress, wherever you are.
 *
 * The queue lives in a store rather than a component, so uploads carry on
 * perfectly well after navigating to the archive to watch documents arrive —
 * which is exactly what an operator does. Without something in the chrome,
 * though, that work becomes invisible the moment they leave the page, and the
 * only way to check on it is to go back and interrupt themselves.
 *
 * Hidden on /upload itself, where the full panel is already on screen.
 */
export function UploadStatusPill() {
  const queue = useUploadStore((state) => state.queue);
  const pathname = usePathname();

  const summary = summarise(queue);
  const active = summary.queued + summary.uploading + summary.retrying;
  const done = summary.succeeded + summary.failed;

  if (pathname.startsWith('/upload')) return null;
  if (active === 0 && summary.failed === 0) return null;

  const isPaused = queue.isPaused && active > 0;

  return (
    <Link
      href="/upload"
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active > 0
          ? 'border-status-uploading/30 bg-status-uploading/10 text-status-uploading'
          : 'border-status-failed/30 bg-status-failed/10 text-status-failed',
      )}
    >
      {active > 0 ? (
        isPaused ? (
          <PauseIcon aria-hidden className="size-3.5" />
        ) : (
          <LoaderIcon aria-hidden className="size-3.5 animate-spin" />
        )
      ) : (
        <TriangleAlertIcon aria-hidden className="size-3.5" />
      )}

      <span className="tabular-nums">
        {active > 0
          ? `${numberFormat.format(done)} / ${numberFormat.format(summary.total - summary.cancelled)}`
          : `${numberFormat.format(summary.failed)} failed`}
      </span>

      {active > 0 && summary.etaSeconds !== null && !isPaused ? (
        <span className="hidden sm:inline">
          · {formatDuration(summary.etaSeconds)}
        </span>
      ) : null}
      {isPaused ? <span className="hidden sm:inline">· paused</span> : null}
    </Link>
  );
}
