import { describe, expect, it } from 'vitest';
import {
  parseResumeMap,
  pruneResumeMap,
  resumeKeyFor,
  type ResumeEntry,
} from './resume-store';

const entry = (createdAt: number): ResumeEntry => ({
  uploadId: 'u1',
  resumeToken: 't1',
  totalParts: 3,
  createdAt,
});

describe('resumeKeyFor', () => {
  it('combines name, size and lastModified', () => {
    expect(
      resumeKeyFor({ name: 'scan.pdf', size: 1024, lastModified: 99 }),
    ).toBe('scan.pdf:1024:99');
  });

  it('distinguishes same-named files that differ in size or mtime', () => {
    const a = resumeKeyFor({ name: 'scan.pdf', size: 1024, lastModified: 99 });
    const b = resumeKeyFor({ name: 'scan.pdf', size: 2048, lastModified: 99 });
    const c = resumeKeyFor({ name: 'scan.pdf', size: 1024, lastModified: 100 });
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe('parseResumeMap', () => {
  it('returns empty for null (nothing saved yet)', () => {
    expect(parseResumeMap(null)).toEqual({});
  });

  it('returns empty for invalid JSON rather than throwing', () => {
    expect(parseResumeMap('{not json')).toEqual({});
  });

  it('returns empty when an entry does not match the schema', () => {
    expect(
      parseResumeMap(JSON.stringify({ k: { uploadId: 'only-this' } })),
    ).toEqual({});
  });

  it('round-trips a valid map', () => {
    const map = { 'scan.pdf:1024:99': entry(1_000) };
    expect(parseResumeMap(JSON.stringify(map))).toEqual(map);
  });
});

describe('pruneResumeMap', () => {
  const now = 10_000_000;
  const hour = 60 * 60 * 1000;

  it('keeps entries inside the TTL', () => {
    const map = { fresh: entry(now - hour + 1_000) };
    expect(pruneResumeMap(map, now)).toEqual(map);
  });

  it('drops entries past the TTL', () => {
    const map = { stale: entry(now - hour - 1) };
    expect(pruneResumeMap(map, now)).toEqual({});
  });

  it('keeps the fresh ones and drops only the stale ones', () => {
    const map = {
      stale: entry(now - hour - 1),
      fresh: entry(now - 1_000),
    };
    expect(Object.keys(pruneResumeMap(map, now))).toEqual(['fresh']);
  });
});
