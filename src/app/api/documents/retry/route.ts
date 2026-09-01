import { z } from 'zod';
import { documentFiltersSchema } from '@/lib/domain/document';
import { archive } from '@/server/archive';
import { apiLatency, jsonError } from '@/server/http';

/**
 * Two ways to say what to retry.
 *
 * `ids` covers an explicit selection. `filter` covers "everything matching what
 * I am looking at, except these few" — which is the only sane way to express a
 * retry across 100,000 rows, since the alternative is a request body listing
 * every one of them.
 */
const bodySchema = z.union([
  z.object({ ids: z.array(z.string()).min(1).max(5_000) }),
  z.object({
    filter: documentFiltersSchema,
    except: z.array(z.string()).max(5_000).default([]),
  }),
]);

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      400,
      'INVALID_BODY',
      'Expected { ids } or { filter, except }',
    );
  }

  await apiLatency(150, 500);

  // Refusals are part of a successful response, not an error: asking to retry
  // forty documents where six are password-protected is a normal outcome.
  const outcome =
    'ids' in parsed.data
      ? archive.retry(parsed.data.ids)
      : archive.retryMatching(parsed.data.filter, parsed.data.except);

  return Response.json(outcome);
}
