import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, type DocumentFilters } from '@/lib/domain/document';
import {
  addSavedView,
  MAX_SAVED_VIEWS,
  parseSavedViews,
  removeSavedView,
  serializeSavedViews,
  type SavedView,
} from './saved-views';

const filters: DocumentFilters = {
  ...DEFAULT_FILTERS,
  status: ['failed'],
  q: 'kurigram',
};

describe('parseSavedViews', () => {
  it('returns an empty list for null (nothing saved yet)', () => {
    expect(parseSavedViews(null)).toEqual([]);
  });

  it('returns an empty list for invalid JSON rather than throwing', () => {
    expect(parseSavedViews('{not json')).toEqual([]);
  });

  it('returns an empty list when the shape does not match the schema', () => {
    expect(
      parseSavedViews(JSON.stringify([{ name: 'missing everything else' }])),
    ).toEqual([]);
  });

  it('round-trips a valid list through serialize/parse', () => {
    const views: SavedView[] = [
      {
        id: '1',
        name: 'Failed in Kurigram',
        filters,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(parseSavedViews(serializeSavedViews(views))).toEqual(views);
  });
});

describe('addSavedView', () => {
  const now = new Date('2026-02-01T00:00:00.000Z');
  const makeId = () => 'fixed-id';

  it('adds a view with a trimmed name, newest first', () => {
    const result = addSavedView([], '  Needs review  ', filters, now, makeId);
    expect(result).toEqual([
      {
        id: 'fixed-id',
        name: 'Needs review',
        filters,
        createdAt: now.toISOString(),
      },
    ]);
  });

  it('does nothing for a blank name', () => {
    expect(addSavedView([], '   ', filters, now, makeId)).toEqual([]);
  });

  it('puts the new view before existing ones', () => {
    const existing: SavedView[] = [
      {
        id: 'old',
        name: 'Old view',
        filters,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const result = addSavedView(existing, 'New view', filters, now, makeId);
    expect(result.map((v) => v.name)).toEqual(['New view', 'Old view']);
  });

  it('caps the list at MAX_SAVED_VIEWS, dropping the oldest', () => {
    const existing: SavedView[] = Array.from(
      { length: MAX_SAVED_VIEWS },
      (_, i) => ({
        id: `id-${i}`,
        name: `View ${i}`,
        filters,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const result = addSavedView(existing, 'Newest', filters, now, makeId);
    expect(result).toHaveLength(MAX_SAVED_VIEWS);
    expect(result[0]?.name).toBe('Newest');
    expect(result.some((v) => v.id === `id-${MAX_SAVED_VIEWS - 1}`)).toBe(
      false,
    );
  });
});

describe('removeSavedView', () => {
  it('removes only the matching id', () => {
    const views: SavedView[] = [
      { id: 'a', name: 'A', filters, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', name: 'B', filters, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(removeSavedView(views, 'a').map((v) => v.id)).toEqual(['b']);
  });

  it('is a no-op when the id is not present', () => {
    const views: SavedView[] = [
      { id: 'a', name: 'A', filters, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(removeSavedView(views, 'missing')).toEqual(views);
  });
});
