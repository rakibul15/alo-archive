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
