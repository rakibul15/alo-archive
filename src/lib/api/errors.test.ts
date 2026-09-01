import { describe, expect, it } from 'vitest';
import { ApiError, isRetryable } from './errors';

describe('isRetryable', () => {
  it('retries transport failures', () => {
    expect(
      isRetryable(new ApiError({ kind: 'network', message: 'offline' })),
    ).toBe(true);
  });

  it('retries server faults but not client mistakes', () => {
    const server = new ApiError({ kind: 'http', message: '', status: 503 });
    const client = new ApiError({ kind: 'http', message: '', status: 404 });
    expect(isRetryable(server)).toBe(true);
    expect(isRetryable(client)).toBe(false);
  });

  it('never retries a schema mismatch — the answer would be identical', () => {
    expect(isRetryable(new ApiError({ kind: 'parse', message: '' }))).toBe(
      false,
    );
  });

  it('never retries a deliberate abort', () => {
    expect(isRetryable(new ApiError({ kind: 'aborted', message: '' }))).toBe(
      false,
    );
  });

  it('treats non-ApiError throwables as non-retryable', () => {
    expect(isRetryable(new Error('boom'))).toBe(false);
    expect(isRetryable('boom')).toBe(false);
  });
});
