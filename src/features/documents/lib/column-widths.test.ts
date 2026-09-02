import { describe, expect, it } from 'vitest';
import {
  clampWidth,
  DEFAULT_COLUMN_WIDTHS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseColumnWidths,
  resizeColumn,
  serializeColumnWidths,
  toGridTemplateColumns,
  type ColumnWidths,
} from './column-widths';

describe('clampWidth', () => {
  it('leaves an in-range width alone (rounded)', () => {
    expect(clampWidth(200.4)).toBe(200);
  });

  it('floors at MIN_COLUMN_WIDTH', () => {
    expect(clampWidth(10)).toBe(MIN_COLUMN_WIDTH);
  });

  it('ceilings at MAX_COLUMN_WIDTH', () => {
    expect(clampWidth(10_000)).toBe(MAX_COLUMN_WIDTH);
  });
});

describe('parseColumnWidths', () => {
  it('returns the defaults for null (nothing saved yet)', () => {
    expect(parseColumnWidths(null)).toEqual(DEFAULT_COLUMN_WIDTHS);
  });

  it('returns the defaults for invalid JSON rather than throwing', () => {
    expect(parseColumnWidths('{not json')).toEqual(DEFAULT_COLUMN_WIDTHS);
  });

  it('returns the defaults when the shape does not match the schema', () => {
    expect(parseColumnWidths(JSON.stringify({ person: 'wide' }))).toEqual(
      DEFAULT_COLUMN_WIDTHS,
    );
  });

  it('round-trips a valid set through serialize/parse', () => {
    const widths: ColumnWidths = {
      person: 300,
      status: 150,
      confidence: 160,
      uploaded: 130,
    };
    expect(parseColumnWidths(serializeColumnWidths(widths))).toEqual(widths);
  });

  it('clamps a stored value outside the current bounds', () => {
    const stored: ColumnWidths = {
      person: 5,
      status: 9_999,
      confidence: 160,
      uploaded: 130,
    };
    const result = parseColumnWidths(serializeColumnWidths(stored));
    expect(result.person).toBe(MIN_COLUMN_WIDTH);
    expect(result.status).toBe(MAX_COLUMN_WIDTH);
  });
});

describe('resizeColumn', () => {
  it('adds the delta to just the given column', () => {
    const result = resizeColumn(DEFAULT_COLUMN_WIDTHS, 'status', 20);
    expect(result.status).toBe(DEFAULT_COLUMN_WIDTHS.status + 20);
    expect(result.person).toBe(DEFAULT_COLUMN_WIDTHS.person);
  });

  it('clamps at the minimum when shrinking past it', () => {
    const result = resizeColumn(DEFAULT_COLUMN_WIDTHS, 'uploaded', -1_000);
    expect(result.uploaded).toBe(MIN_COLUMN_WIDTH);
  });

  it('clamps at the maximum when growing past it', () => {
    const result = resizeColumn(DEFAULT_COLUMN_WIDTHS, 'confidence', 1_000);
    expect(result.confidence).toBe(MAX_COLUMN_WIDTH);
  });
});

describe('toGridTemplateColumns', () => {
  it('puts the checkbox and the flexible document column first', () => {
    const template = toGridTemplateColumns(DEFAULT_COLUMN_WIDTHS);
    expect(template.startsWith('2.25rem minmax(0,1fr) ')).toBe(true);
  });

  it('renders the four resizable columns as pixel widths, in order', () => {
    const widths: ColumnWidths = {
      person: 111,
      status: 222,
      confidence: 333,
      uploaded: 444,
    };
    expect(toGridTemplateColumns(widths)).toBe(
      '2.25rem minmax(0,1fr) 111px 222px 333px 444px',
    );
  });
});
