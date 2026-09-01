import { z } from 'zod';
import { EXTRACTED_FIELD_KEYS } from '@/lib/domain/document';
import { archive } from '@/server/archive';
import { apiLatency, jsonError } from '@/server/http';

const bodySchema = z.object({
  field: z.enum(EXTRACTED_FIELD_KEYS),
  value: z.string().trim().min(1).max(200),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      400,
      'INVALID_BODY',
      'Expected { field: ExtractedFieldKey, value: string }',
    );
  }

  await apiLatency(150, 450);

  const updated = archive.correct(id, parsed.data.field, parsed.data.value);
  if (!updated) {
    return jsonError(404, 'NOT_FOUND', `No reviewable document with id ${id}`);
  }
  return Response.json(updated);
}
