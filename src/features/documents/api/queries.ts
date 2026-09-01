import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { clientEnv } from '@/env.client';
import { request, toQueryString } from '@/lib/api/client';
import { isRetryable } from '@/lib/api/errors';
import {
  archiveSummarySchema,
  documentPageSchema,
  documentRecordSchema,
  type DocumentFilters,
} from '@/lib/domain/document';
import { documentKeys } from './keys';

/**
 * `queryOptions`/`infiniteQueryOptions` rather than bespoke hooks: the same
 * definition can be used by `useQuery`, by `prefetchQuery`, and by
 * `queryClient.setQueryData` with the types lining up in all three.
 */
export const documentListOptions = (filters: DocumentFilters) =>
  infiniteQueryOptions({
    queryKey: documentKeys.list(filters),
    // `signal` comes from TanStack Query and is forwarded to fetch, so typing
    // in the search box cancels the request it just superseded instead of
    // letting a slow earlier response overwrite a fast later one.
    queryFn: ({ pageParam, signal }) =>
      request(
        `/documents${toQueryString({
          ...filters,
          cursor: pageParam,
          limit: clientEnv.NEXT_PUBLIC_PAGE_SIZE,
        })}`,
        documentPageSchema,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: (attempt, error) => attempt < 2 && isRetryable(error),
  });

export const documentDetailOptions = (id: string) =>
  queryOptions({
    queryKey: documentKeys.detail(id),
    queryFn: ({ signal }) =>
      request(`/documents/${id}`, documentRecordSchema, { signal }),
    retry: (attempt, error) => attempt < 2 && isRetryable(error),
  });

export const archiveSummaryOptions = () =>
  queryOptions({
    queryKey: documentKeys.summary(),
    queryFn: ({ signal }) =>
      request('/summary', archiveSummarySchema, { signal }),
    // The SSE stream pushes updates; this is only the fallback for a browser
    // or proxy that has dropped the connection.
    refetchInterval: 15_000,
  });
