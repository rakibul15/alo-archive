import type { NextRequest } from 'next/server';
import { archive } from '@/server/archive';
import { apiLatency, parseFilters, parsePagination } from '@/server/http';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters = parseFilters(params);
  const { cursor, limit } = parsePagination(params);

  await apiLatency();

  return Response.json(archive.list(filters, cursor, limit));
}
