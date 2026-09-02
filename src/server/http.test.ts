import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from '@/lib/domain/document';
import { parseFilters, parsePagination } from './http';

function params(entries: Record<string, string>): URLSearchParams {
  return new URLSearchParams(entries);
}

describe('parseFilters', () => {
  it('returns the defaults for an empty query', () => {
    expect(parseFilters(params({}))).toEqual(DEFAULT_FILTERS);
  });

  it('parses a valid single-value status and type', () => {
    const filters = parseFilters(params({ status: 'failed', type: 'id_scan' }));
    expect(filters.status).toEqual(['failed']);
    expect(filters.type).toEqual(['id_scan']);
  });

  it('parses comma-separated multi-value status', () => {
    const filters = parseFilters(params({ status: 'failed,completed' }));
    expect(filters.status).toEqual(['failed', 'completed']);
  });

  it('falls back to defaults entirely when status contains an unknown value', () => {
    // A degrade-to-everything contract: one bad entry in a comma list voids
    // the whole filter set rather than silently narrowing to the half that
    // parsed, per src/features/documents/lib/invalid-filter-params.ts.
    const filters = parseFilters(params({ status: 'failed,not-a-status' }));
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it('falls back to defaults when sort is not a recognised value', () => {
    const filters = parseFilters(params({ sort: 'not-a-sort' }));
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it('falls back to defaults when confidence is not a recognised value', () => {
    const filters = parseFilters(params({ confidence: 'garbage' }));
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it('keeps free-text q verbatim, including values that look invalid elsewhere', () => {
    const filters = parseFilters(params({ q: 'garbage' }));
    expect(filters.q).toBe('garbage');
  });
});

describe('parsePagination', () => {
  it('defaults to a null cursor and a limit of 100', () => {
    expect(parsePagination(params({}))).toEqual({ cursor: null, limit: 100 });
  });

  it('passes through a valid cursor and limit', () => {
    expect(parsePagination(params({ cursor: 'abc', limit: '50' }))).toEqual({
      cursor: 'abc',
      limit: 50,
    });
  });

  it('falls back to the default limit when it is out of range', () => {
    expect(parsePagination(params({ limit: '5000' }))).toEqual({
      cursor: null,
      limit: 100,
    });
  });

  it('falls back to the default limit when it is not a number', () => {
    expect(parsePagination(params({ limit: 'not-a-number' }))).toEqual({
      cursor: null,
      limit: 100,
    });
  });
});
