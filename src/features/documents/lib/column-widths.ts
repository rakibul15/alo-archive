import { z } from 'zod';

/**
 * `document` stays flexible (`minmax(0, 1fr)`) and absorbs whatever space
 * these four don't use — the table having no horizontal scrollbar is a
 * deliberate design goal (see README → "Scale"), so every resizable column
 * needs a fixed width for that to keep holding once widths are no longer
 * all Tailwind's `fr` units.
 */
export const RESIZABLE_COLUMNS = [
  'person',
  'status',
  'confidence',
  'uploaded',
] as const;
export type ResizableColumn = (typeof RESIZABLE_COLUMNS)[number];

export type ColumnWidths = Record<ResizableColumn, number>;

/** Pixel equivalents of this table's original fixed Tailwind widths. */
export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  person: 240,
  status: 144,
  confidence: 152,
  uploaded: 128,
};

export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 480;

export function clampWidth(width: number): number {
  return Math.min(
    Math.max(Math.round(width), MIN_COLUMN_WIDTH),
    MAX_COLUMN_WIDTH,
  );
}

const columnWidthsSchema = z.object({
  person: z.number().finite(),
  status: z.number().finite(),
  confidence: z.number().finite(),
  uploaded: z.number().finite(),
});

export const COLUMN_WIDTHS_STORAGE_KEY = 'alo-archive:column-widths';

/**
 * Same contract as every other "read untrusted local state" parser in this
 * app (`parseSavedViews`, `parseFilters`): invalid input falls back to a
 * known-good default instead of throwing, because a corrupted preference
 * should degrade to "as if nothing were saved," not break the page.
 */
export function parseColumnWidths(raw: string | null): ColumnWidths {
  if (raw === null) return DEFAULT_COLUMN_WIDTHS;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_COLUMN_WIDTHS;
  }
  const parsed = columnWidthsSchema.safeParse(json);
  if (!parsed.success) return DEFAULT_COLUMN_WIDTHS;
  // Clamped on the way in too, in case the stored value predates a change
  // to MIN_COLUMN_WIDTH/MAX_COLUMN_WIDTH.
  return {
    person: clampWidth(parsed.data.person),
    status: clampWidth(parsed.data.status),
    confidence: clampWidth(parsed.data.confidence),
    uploaded: clampWidth(parsed.data.uploaded),
  };
}

export function serializeColumnWidths(widths: ColumnWidths): string {
  return JSON.stringify(widths);
}

export function resizeColumn(
  widths: ColumnWidths,
  column: ResizableColumn,
  deltaPx: number,
): ColumnWidths {
  return { ...widths, [column]: clampWidth(widths[column] + deltaPx) };
}

/** The `grid-template-columns` value: checkbox, the flexible document column, then these four. */
export function toGridTemplateColumns(widths: ColumnWidths): string {
  return [
    '2.25rem',
    'minmax(0,1fr)',
    `${widths.person}px`,
    `${widths.status}px`,
    `${widths.confidence}px`,
    `${widths.uploaded}px`,
  ].join(' ');
}
