import { z } from 'zod';
import { env } from '@/env';
import { archive } from '@/server/archive';
import { jsonError } from '@/server/http';

const bodySchema = z.object({
  fileName: z.string().min(1).max(400),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(200),
  batchId: z.string().nullable().default(null),
});

/**
 * Stands in for the ingest endpoint. Nothing is stored — only the file's
 * metadata is registered so the document can enter the processing queue.
 *
 * A share of requests fail on purpose so the client's retry-with-backoff path
 * is exercised in normal use rather than only in a contrived demo.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, 'INVALID_BODY', 'Malformed upload descriptor');
  }

  await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 320));

  if (Math.random() < env.SIM_FAILURE_RATE / 2) {
    return jsonError(
      503,
      'UPSTREAM_UNAVAILABLE',
      'Ingest service is temporarily unavailable',
    );
  }

  return Response.json(archive.enqueue(parsed.data), { status: 201 });
}
