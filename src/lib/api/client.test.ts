import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { request, toQueryString } from './client';
import { ApiError } from './errors';

describe('toQueryString', () => {
  it('returns an empty string for no entries', () => {
    expect(toQueryString({})).toBe('');
  });

  it('omits null, undefined and empty-string values', () => {
    expect(toQueryString({ a: null, b: undefined, c: '', d: 'kept' })).toBe(
      '?d=kept',
    );
  });

  it('joins array values with commas', () => {
    expect(toQueryString({ status: ['pending', 'failed'] })).toBe(
      '?status=pending%2Cfailed',
    );
  });

  it('omits an empty array entirely rather than emitting a bare key', () => {
    expect(toQueryString({ status: [], q: 'x' })).toBe('?q=x');
  });

  it('stringifies numbers', () => {
    expect(toQueryString({ limit: 100 })).toBe('?limit=100');
  });
});

describe('request', () => {
  const schema = z.object({ id: z.string() });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a successful response against the schema', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 'ALO-1' }), { status: 200 }),
    );
    await expect(request('/documents/ALO-1', schema)).resolves.toEqual({
      id: 'ALO-1',
    });
  });

  it('throws a parse ApiError when the response does not match the schema', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ wrong: 'shape' }), { status: 200 }),
    );
    const error = await request('/documents/ALO-1', schema).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('parse');
  });

  it('throws a network ApiError when fetch itself fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await request('/documents/ALO-1', schema).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
  });

  it('throws an aborted ApiError when the signal was cancelled', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    );
    const error = await request('/documents/ALO-1', schema).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('aborted');
  });

  it('throws an http ApiError carrying the parsed error body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: 'gone' } }),
        { status: 404 },
      ),
    );
    const error = await request('/documents/ALO-1', schema).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBe('NOT_FOUND');
    expect((error as ApiError).message).toBe('gone');
  });

  it('falls back to a generic message when the error body is not the agreed shape', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('not json', { status: 500 }),
    );
    const error = await request('/documents/ALO-1', schema).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBeNull();
    expect((error as ApiError).message).toBe('Request failed with 500');
  });
});
