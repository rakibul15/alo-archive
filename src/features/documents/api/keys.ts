import type { DocumentFilters } from '@/lib/domain/document';

/**
 * One factory for every documents cache key.
 *
 * Hand-written key arrays scattered across hooks are how invalidation quietly
 * stops working: one place writes `['documents', 'list']` and another
 * invalidates `['document-list']`, and nothing ever refreshes again. Deriving
 * them from a single object makes `documentKeys.all` a guaranteed prefix of
 * everything below it.
 */
export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (filters: DocumentFilters) =>
    [...documentKeys.lists(), filters] as const,
  details: () => [...documentKeys.all, 'detail'] as const,
  detail: (id: string) => [...documentKeys.details(), id] as const,
  summary: () => [...documentKeys.all, 'summary'] as const,
} as const;
