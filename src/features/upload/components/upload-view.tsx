'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { InfoIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { documentKeys } from '@/features/documents/api/keys';
import { useInterruptedBatch } from '../hooks/use-interrupted-batch';
import { useUploadStore } from '../store';
import { UploadDropzone } from './upload-dropzone';
import { UploadQueuePanel } from './upload-queue-panel';

/** Freshly ingested rows are folded into the archive at most this often. */
const REFRESH_INTERVAL_MS = 2_000;

export function UploadView() {
  const queryClient = useQueryClient();
  const completedCount = useUploadStore((state) => state.completedCount);
  const { interrupted, dismiss } = useInterruptedBatch();
  const lastRefresh = useRef(0);

  /**
   * Each successful upload adds a document, but invalidating per file would
   * mean a page request per file. Throttled, so a five thousand file batch
   * costs a handful of refreshes rather than five thousand.
   */
  useEffect(() => {
    if (completedCount === 0) return;
    const now = Date.now();
    if (now - lastRefresh.current < REFRESH_INTERVAL_MS) return;
    lastRefresh.current = now;
    void queryClient.invalidateQueries({ queryKey: documentKeys.all });
  }, [completedCount, queryClient]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {interrupted ? (
        <Alert>
          <InfoIcon aria-hidden />
          <AlertTitle>
            {interrupted.pending} upload
            {interrupted.pending === 1 ? '' : 's'} did not finish
          </AlertTitle>
          <AlertDescription>
            <p>
              The page was closed or reloaded while they were still going.
              Browsers do not let a page hold on to files across a reload, so
              they have to be selected again — nothing already uploaded was
              lost.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={dismiss}
            >
              Understood
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <UploadDropzone />

      {completedCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {completedCount} document{completedCount === 1 ? '' : 's'} handed to
          the processing queue —{' '}
          <Link href="/documents" className="text-foreground underline">
            watch them come through
          </Link>
          .
        </p>
      ) : null}

      <UploadQueuePanel />
    </div>
  );
}
