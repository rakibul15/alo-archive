'use client';

import { useMemo } from 'react';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import {
  CONFIDENCE_FILTERS,
  DEFAULT_FILTERS,
  DOCUMENT_SORTS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  SORT_DIRECTIONS,
  type DocumentFilters,
  type DocumentSort,
} from '@/lib/domain/document';

/**
 * Filters live in the URL, not in component state.
 *
 * "Show me everything from Kurigram that failed" is something an operator will
 * want to send to a colleague or come back to tomorrow, and it should survive a
 * refresh. It also means the query cache key and the address bar cannot drift
 * apart — there is one source of truth for what is on screen.
 */
const filterParsers = {
  q: parseAsString.withDefault(DEFAULT_FILTERS.q),
  status: parseAsArrayOf(parseAsStringLiteral(DOCUMENT_STATUSES)).withDefault(
    [],
  ),
  type: parseAsArrayOf(parseAsStringLiteral(DOCUMENT_TYPES)).withDefault([]),
  confidence: parseAsStringLiteral(CONFIDENCE_FILTERS).withDefault('any'),
  sort: parseAsStringLiteral(DOCUMENT_SORTS).withDefault(DEFAULT_FILTERS.sort),
  dir: parseAsStringLiteral(SORT_DIRECTIONS).withDefault(DEFAULT_FILTERS.dir),
};

export function useDocumentFilters() {
  const [raw, setFilters] = useQueryStates(filterParsers, {
    // Defaults are stripped from the URL, so a pristine view is just
    // `/documents` rather than six redundant query parameters.
    clearOnDefault: true,
    history: 'replace',
  });

  const filters = useMemo<DocumentFilters>(
    () => ({
      q: raw.q,
      status: raw.status,
      type: raw.type,
      confidence: raw.confidence,
      sort: raw.sort,
      dir: raw.dir,
    }),
    [raw.q, raw.status, raw.type, raw.confidence, raw.sort, raw.dir],
  );

  const isFiltered =
    filters.q !== '' ||
    filters.status.length > 0 ||
    filters.type.length > 0 ||
    filters.confidence !== 'any';

  return {
    filters,
    isFiltered,
    setFilters,
    /** Clicking the same column twice flips direction, as everyone expects. */
    toggleSort: (sort: DocumentSort) => {
      void setFilters((current) =>
        current.sort === sort
          ? { dir: current.dir === 'asc' ? 'desc' : 'asc' }
          : { sort, dir: sort === 'fileName' ? 'asc' : 'desc' },
      );
    },
    reset: () => {
      void setFilters({
        q: null,
        status: null,
        type: null,
        confidence: null,
      });
    },
  };
}

/** The document open in the detail panel. Separate so it survives filtering. */
export function useSelectedDocument() {
  return useQueryState('doc', parseAsString);
}
