import { z } from 'zod';
import {
  documentFiltersSchema,
  type DocumentFilters,
} from '@/lib/domain/document';

/**
 * A named, reusable filter combination.
 *
 * There's no account system here (see ASSUMPTIONS.md — one operator, no
 * roles), so "saved" means "in this browser" — `localStorage`, not a server
 * record. That's the right scope for a prototype and the wrong one for a
 * multi-user deployment, same trade as the rest of this app's persistence.
 */
export const savedViewSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  filters: documentFiltersSchema,
  createdAt: z.string(),
});
export type SavedView = z.infer<typeof savedViewSchema>;

export const SAVED_VIEWS_STORAGE_KEY = 'alo-archive:saved-views';

/**
 * Same ceiling as the upload rejections list, for the same reason: nothing
 * here needs to grow without bound, and a runaway list is a worse failure
 * mode than a firm cap.
 */
export const MAX_SAVED_VIEWS = 20;

/**
 * `localStorage` content is untrusted the moment it's read back — hand-edited,
 * written by a previous version of this schema, or just corrupted. Falls back
 * to an empty list rather than throwing, matching every other "invalid input"
 * contract in this app (`parseFilters`, `env.ts`): a bad saved-views blob
 * should not be able to break the page that reads it.
 */
export function parseSavedViews(raw: string | null): SavedView[] {
  if (raw === null) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const parsed = z.array(savedViewSchema).safeParse(json);
  return parsed.success ? parsed.data : [];
}

export function serializeSavedViews(views: readonly SavedView[]): string {
  return JSON.stringify(views);
}

/**
 * Appends a view, newest first — the one just saved is the one most likely
 * to be wanted next, and a growing list should surface it without scrolling.
 * Silently drops the oldest once `MAX_SAVED_VIEWS` is reached, same
 * tally-don't-throw shape as the rejection list.
 */
export function addSavedView(
  views: readonly SavedView[],
  name: string,
  filters: DocumentFilters,
  now = new Date(),
  makeId: () => string = () => crypto.randomUUID(),
): SavedView[] {
  const trimmed = name.trim();
  if (trimmed === '') return [...views];
  const next: SavedView = {
    id: makeId(),
    name: trimmed,
    filters,
    createdAt: now.toISOString(),
  };
  return [next, ...views].slice(0, MAX_SAVED_VIEWS);
}

export function removeSavedView(
  views: readonly SavedView[],
  id: string,
): SavedView[] {
  return views.filter((view) => view.id !== id);
}
