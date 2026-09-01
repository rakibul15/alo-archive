import { z } from 'zod';
import { env } from '@/env';
import { archive } from '@/server/archive';
import { jsonError } from '@/server/http';

const bodySchema = z.object({
  size: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

/**
 * Grows the archive to demonstrate scale.
 *
 * Nobody reviewing this is going to drag 100,000 files onto a dropzone, so the
 * app has to be able to put itself in that state. Rows are synthesised from
 * their index, so this is a fast, allocation-light operation.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(400, 'INVALID_BODY', 'Expected { size?: number }');
  }

  const target = parsed.data.size ?? env.SIM_SCALE_CORPUS_SIZE;
  const startedAt = performance.now();
  const size = archive.grow(target);

  return Response.json({
    size,
    generatedInMs: Math.round(performance.now() - startedAt),
  });
}
