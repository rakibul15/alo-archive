'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { archiveSummarySchema } from '@/lib/domain/document';
import { documentKeys } from '../api/keys';

const changedSchema = z.object({ ids: z.array(z.string()) });

/** Lists are refetched at most this often, however busy the stream is. */
const LIST_REFRESH_INTERVAL_MS = 1_500;

/**
 * Subscribes to processing progress.
 *
 * The stream deliberately sends ids rather than documents, so this hook has to
 * decide what is worth refetching. It does two cheap things:
 *
 *  - writes the aggregate summary straight into the cache (no request), and
 *  - invalidates only the *detail* queries that are already cached — a
 *    document nobody has open does not need fetching just because it moved.
 *
 * List invalidation is throttled, because during a large batch the answer to
 * "did anything change" is yes, continuously, and refetching a page per event
 * would be worse than useless.
 */
export function useArchiveStream(enabled = true): void {
  const queryClient = useQueryClient();
  const lastListRefresh = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource('/api/stream');

    const onSummary = (event: Event) => {
      if (!(event instanceof MessageEvent)) return;
      const parsed = archiveSummarySchema.safeParse(safeJson(event.data));
      if (parsed.success) {
        queryClient.setQueryData(documentKeys.summary(), parsed.data);
      }
    };

    const onChanged = (event: Event) => {
      if (!(event instanceof MessageEvent)) return;
      const parsed = changedSchema.safeParse(safeJson(event.data));
      if (!parsed.success) return;

      for (const id of parsed.data.ids) {
        const key = documentKeys.detail(id);
        if (queryClient.getQueryData(key) !== undefined) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }

      const now = Date.now();
      if (now - lastListRefresh.current >= LIST_REFRESH_INTERVAL_MS) {
        lastListRefresh.current = now;
        void queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
      }
    };

    source.addEventListener('summary', onSummary);
    source.addEventListener('changed', onChanged);

    return () => {
      source.removeEventListener('summary', onSummary);
      source.removeEventListener('changed', onChanged);
      source.close();
    };
  }, [enabled, queryClient]);
}

function safeJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
