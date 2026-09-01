import 'server-only';
import { z } from 'zod';
import {
  documentFiltersSchema,
  type DocumentFilters,
} from '@/lib/domain/document';

/**
 * Enough delay that loading and empty states are actually reachable in the UI
 * — a mock API that answers in 0 ms makes skeletons untestable and hides the
 * race conditions this app is supposed to demonstrate handling.
 */
export function apiLatency(min = 90, max = 280): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

const listOfEnum = (raw: string | null): string[] =>
  raw ? raw.split(',').filter(Boolean) : [];

/**
 * Query string to filters. Anything unparseable falls back to the default
 * rather than 400-ing: a hand-edited URL should degrade to "show me
 * everything", not to an error page.
 */
export function parseFilters(params: URLSearchParams): DocumentFilters {
  const parsed = documentFiltersSchema.safeParse({
    q: params.get('q') ?? undefined,
    status: listOfEnum(params.get('status')),
    type: listOfEnum(params.get('type')),
    confidence: params.get('confidence') ?? undefined,
    sort: params.get('sort') ?? undefined,
    dir: params.get('dir') ?? undefined,
  });
  return parsed.success ? parsed.data : documentFiltersSchema.parse({});
}

export const paginationSchema = z.object({
  cursor: z.string().nullable().default(null),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export function parsePagination(params: URLSearchParams): {
  cursor: string | null;
  limit: number;
} {
  const parsed = paginationSchema.safeParse({
    cursor: params.get('cursor'),
    limit: params.get('limit') ?? undefined,
  });
  return parsed.success ? parsed.data : { cursor: null, limit: 100 };
}
