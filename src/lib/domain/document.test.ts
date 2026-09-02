import { describe, expect, it } from 'vitest';
import {
  confidenceBand,
  documentFiltersSchema,
  overallConfidence,
  type ExtractedFields,
  type FieldValue,
} from './document';

const field = (confidence: number): FieldValue => ({
  value: 'x',
  confidence,
  status: 'ok',
  raw: null,
  box: { x: 0.1, y: 0.1, width: 0.2, height: 0.04, page: 1 },
});

const fields = (confidences: number[]): ExtractedFields => ({
  personName: field(confidences[0] ?? 1),
  phone: field(confidences[1] ?? 1),
  location: field(confidences[2] ?? 1),
  programName: field(confidences[3] ?? 1),
  documentDate: field(confidences[4] ?? 1),
  documentType: field(confidences[5] ?? 1),
});

describe('overallConfidence', () => {
  it('reports the weakest field, not the average', () => {
    // Five excellent fields must not be able to hide one unreadable one.
    expect(
      overallConfidence(fields([0.99, 0.98, 0.97, 0.99, 0.98, 0.31])),
    ).toBe(0.31);
  });

  it('is 1 when every field is certain', () => {
    expect(overallConfidence(fields([1, 1, 1, 1, 1, 1]))).toBe(1);
  });
});

describe('confidenceBand', () => {
  it('maps values onto the bands the UI colours by', () => {
    expect(confidenceBand(0.95)).toBe('high');
    expect(confidenceBand(0.9)).toBe('high');
    expect(confidenceBand(0.8)).toBe('medium');
    expect(confidenceBand(0.75)).toBe('medium');
    expect(confidenceBand(0.74)).toBe('low');
    expect(confidenceBand(null)).toBe('none');
  });
});

describe('documentFiltersSchema', () => {
  it('parses an empty object into usable defaults', () => {
    expect(documentFiltersSchema.parse({})).toEqual({
      q: '',
      status: [],
      type: [],
      confidence: 'any',
      sort: 'uploadedAt',
      dir: 'desc',
    });
  });

  it('rejects an unknown status rather than silently widening the filter', () => {
    expect(documentFiltersSchema.safeParse({ status: ['nope'] }).success).toBe(
      false,
    );
  });
});
