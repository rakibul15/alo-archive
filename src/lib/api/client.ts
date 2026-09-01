import type { z } from 'zod';
import { ApiError } from './errors';

/**
 * The only place in the app that calls `fetch`.
 *
 * Every response is validated against the schema the caller expects, so a
 * change on the server surfaces as one `parse` error here rather than as
 * `undefined` three components deep. It is also the seam: swapping these mock
 * route handlers for a real service is a change to `BASE_URL` and nothing
 * else — no component imports anything below this line.
 */
const BASE_URL = '/api';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Wire this to TanStack Query's `signal` so superseded requests abort. */
  signal?: AbortSignal;
};

const errorBodySchema = {
  parse(value: unknown): { code: string; message: string } | null {
    if (typeof value !== 'object' || value === null) return null;
    const error = (value as { error?: unknown }).error;
    if (typeof error !== 'object' || error === null) return null;
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (typeof code !== 'string' || typeof message !== 'string') return null;
    return { code, message };
  },
};

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiError({
        kind: 'aborted',
        message: 'Request aborted',
        cause,
      });
    }
    throw new ApiError({
      kind: 'network',
      message: 'Network request failed',
      cause,
    });
  }

  if (!response.ok) {
    const parsed = errorBodySchema.parse(
      await response.json().catch(() => null),
    );
    throw new ApiError({
      kind: 'http',
      status: response.status,
      code: parsed?.code ?? null,
      message: parsed?.message ?? `Request failed with ${response.status}`,
    });
  }

  const payload: unknown = await response.json().catch(() => null);
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ApiError({
      kind: 'parse',
      message: `Response for ${path} did not match its schema`,
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function toQueryString(
  entries: Record<
    string,
    string | number | readonly string[] | null | undefined
  >,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
      continue;
    }
    if (value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
