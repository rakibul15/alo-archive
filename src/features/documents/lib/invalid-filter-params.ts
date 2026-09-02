import {
  CONFIDENCE_FILTERS,
  DOCUMENT_SORTS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  SORT_DIRECTIONS,
} from '@/lib/domain/document';

/**
 * Which enum-constrained filter keys hold a value the URL didn't actually
 * ask for.
 *
 * `q` isn't checked — free text can't be "invalid". The rest fall back to a
 * sensible default when a value doesn't parse (`src/server/http.ts` and the
 * nuqs parsers in `use-document-filters.ts` both do this deliberately: a
 * hand-edited or stale shared link should degrade to "show everything," not
 * an error page). That's still the right behaviour. What was missing was any
 * sign it happened — a typo'd or renamed status silently returned the whole
 * unfiltered archive, which reads as "my filter did nothing" rather than "my
 * filter didn't exist."
 *
 * A comma-separated list param (`status`, `type`) counts as invalid if *any*
 * of its entries don't parse, even if others do — a link is either honoured
 * in full or flagged, not silently narrowed to whichever half survived.
 */
const CHECKS = {
  status: (raw: string) =>
    raw.split(',').every((v) => isIn(DOCUMENT_STATUSES, v)),
  type: (raw: string) => raw.split(',').every((v) => isIn(DOCUMENT_TYPES, v)),
  confidence: (raw: string) => isIn(CONFIDENCE_FILTERS, raw),
  sort: (raw: string) => isIn(DOCUMENT_SORTS, raw),
  dir: (raw: string) => isIn(SORT_DIRECTIONS, raw),
} as const;

function isIn(options: readonly string[], value: string): boolean {
  return options.includes(value);
}

export function findInvalidFilterParams(
  searchParams: URLSearchParams,
): string[] {
  const invalid: string[] = [];
  for (const [key, isValid] of Object.entries(CHECKS)) {
    const raw = searchParams.get(key);
    if (raw !== null && raw !== '' && !isValid(raw)) {
      invalid.push(key);
    }
  }
  return invalid;
}
