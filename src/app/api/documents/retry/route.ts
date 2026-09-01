import { z } from 'zod';
import { archive } from '@/server/archive';
import { apiLatency, jsonError } from '@/server/http';

const bodySchema = z.object({
  ids: z.array(z.string()).min(1).max(5_000),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'INVALID_BODY', 'Expected { ids: string[] }');
  }

  await apiLatency(120, 400);

  // Refusals are returned rather than thrown: asking to retry 40 documents
  // where 6 are non-retryable is a normal outcome, not an error.
  return Response.json(archive.retry(parsed.data.ids));
}
