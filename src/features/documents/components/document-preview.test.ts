import { describe, expect, it } from 'vitest';
import type { FieldValue } from '@/lib/domain/document';
import { inkedTextFor } from './document-preview';

const field = (overrides: Partial<FieldValue>): FieldValue => ({
  value: null,
  confidence: 0,
  status: 'ok',
  raw: null,
  box: null,
  ...overrides,
});

describe('inkedTextFor', () => {
  it('shows the raw scan for an uncertain field, mirroring "Scanned as"', () => {
    expect(
      inkedTextFor(
        field({ status: 'low_confidence', value: 'Kamal', raw: 'K@mal' }),
      ),
    ).toBe('K@mal');
  });

  it('falls back to the clean value when there is nothing to show as raw', () => {
    expect(
      inkedTextFor(field({ status: 'ok', value: 'Kamal', raw: null })),
    ).toBe('Kamal');
  });

  /**
   * Regression guard. `raw` is retained on a corrected field as history of the
   * original misread; the page must not keep displaying that misread once a
   * human has fixed the value; -- editing a field and having the page beside it
   * silently keep showing the old text is the bug this exists to catch.
   */
  it('shows the corrected value, not the original misread, once a field is corrected', () => {
    expect(
      inkedTextFor({
        status: 'corrected',
        value: 'Kurigram Sadar, Kurigram',
        raw: 'Char Fasson, Patuakhali',
        confidence: 1,
        box: null,
      }),
    ).toBe('Kurigram Sadar, Kurigram');
  });

  it('renders nothing rather than crashing on an empty corrected value', () => {
    expect(
      inkedTextFor({
        status: 'corrected',
        value: null,
        raw: 'stale',
        confidence: 1,
        box: null,
      }),
    ).toBe('');
  });
});
