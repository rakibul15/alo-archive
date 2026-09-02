import { describe, expect, it } from 'vitest';
import {
  confidenceBand,
  overallConfidence,
  REVIEW_THRESHOLD,
} from '@/lib/domain/document';
import { buildExtractedFields, deriveCore } from './generate';

const ANCHOR = Date.UTC(2026, 7, 31);
const indices = Array.from({ length: 400 }, (_, i) => i);

describe('deriveCore', () => {
  it('is deterministic — the same index always yields the same document', () => {
    expect(deriveCore(4_211, ANCHOR)).toEqual(deriveCore(4_211, ANCHOR));
  });

  it('decorrelates neighbouring indices', () => {
    // Without hashing the index first, adjacent mulberry32 streams are near
    // identical and consecutive rows come out suspiciously alike.
    const names = new Set(
      indices.slice(0, 40).map((i) => deriveCore(i, ANCHOR).personName),
    );
    expect(names.size).toBeGreaterThan(25);
  });
});

describe('extraction confidence distribution', () => {
  it('keeps clean documents above the review threshold', () => {
    for (const index of indices) {
      const core = deriveCore(index, ANCHOR);
      const confidence = overallConfidence(buildExtractedFields(core, false));
      expect(confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    }
  });

  it('pushes degraded documents below it', () => {
    for (const index of indices) {
      const core = deriveCore(index, ANCHOR);
      const confidence = overallConfidence(buildExtractedFields(core, true));
      expect(confidence).toBeLessThan(REVIEW_THRESHOLD);
    }
  });

  /**
   * Regression guard. A document's confidence is the minimum of six fields,
   * and the minimum of six draws lands near the bottom of their range — an
   * earlier per-field range of 0.88–0.995 put almost every clean document on
   * 0.89, exactly on the high/medium boundary, and the entire table rendered
   * as "medium". Most clean documents must read as high.
   */
  it('leaves most clean documents in the high band, not on the boundary', () => {
    const bands = indices.map((index) =>
      confidenceBand(
        overallConfidence(
          buildExtractedFields(deriveCore(index, ANCHOR), false),
        ),
      ),
    );

    const high = bands.filter((band) => band === 'high').length;
    const medium = bands.filter((band) => band === 'medium').length;

    expect(high / bands.length).toBeGreaterThan(0.6);
    // ...but the medium band must still occur, or it is dead UI.
    expect(medium).toBeGreaterThan(0);
    expect(bands).not.toContain('low');
  });
});

describe('bounding boxes', () => {
  it('gives every extracted value a place on the page', () => {
    for (const index of indices.slice(0, 60)) {
      const fields = buildExtractedFields(deriveCore(index, ANCHOR), false);
      for (const field of Object.values(fields)) {
        expect(field.box).not.toBeNull();
      }
    }
  });

  it('gives a missing field no box at all', () => {
    // There is nothing on the page to point at, and drawing a box anyway would
    // be a lie about where the extractor looked.
    const withMissing = indices
      .map((index) => buildExtractedFields(deriveCore(index, ANCHOR), true))
      .flatMap((fields) => Object.values(fields))
      .filter((field) => field.status === 'missing');

    expect(withMissing.length).toBeGreaterThan(0);
    expect(withMissing.every((field) => field.box === null)).toBe(true);
  });

  it('keeps every box inside the page', () => {
    for (const index of indices) {
      const fields = buildExtractedFields(deriveCore(index, ANCHOR), true);
      for (const field of Object.values(fields)) {
        if (!field.box) continue;
        expect(field.box.x).toBeGreaterThanOrEqual(0);
        expect(field.box.y).toBeGreaterThanOrEqual(0);
        expect(field.box.x + field.box.width).toBeLessThanOrEqual(1.001);
        expect(field.box.y + field.box.height).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it('never overlaps two fields, so a highlight is unambiguous', () => {
    const fields = buildExtractedFields(deriveCore(11, ANCHOR), false);
    const rows = Object.values(fields)
      .flatMap((field) => (field.box ? [field.box] : []))
      .sort((a, b) => a.y - b.y);

    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (!previous || !current) continue;
      expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height);
    }
  });
});

describe('raw OCR text', () => {
  it('differs from the cleaned value on damaged numeric fields', () => {
    // Phone numbers and dates are exactly the fields an operator needs to
    // compare against the scan, so the substitution table has to cover digits.
    const differing = indices.filter((index) => {
      const core = deriveCore(index, ANCHOR);
      const fields = buildExtractedFields(core, true);
      return Object.values(fields).some(
        (field) =>
          field.status !== 'ok' &&
          field.raw !== null &&
          field.raw !== field.value,
      );
    });

    expect(differing.length / indices.length).toBeGreaterThan(0.5);
  });
});
