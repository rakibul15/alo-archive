import { archive } from '@/server/archive';
import { apiLatency, jsonError } from '@/server/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  await apiLatency(60, 200);

  const record = archive.get(id);
  if (!record) {
    return jsonError(404, 'NOT_FOUND', `No document with id ${id}`);
  }
  return Response.json(record);
}
