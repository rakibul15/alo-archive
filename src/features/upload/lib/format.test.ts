import { describe, expect, it } from 'vitest';
import { formatPendingNames } from './format';

describe('formatPendingNames', () => {
  it('joins names with commas when nothing was left off the list', () => {
    expect(formatPendingNames(['a.pdf', 'b.pdf'], 2)).toBe('a.pdf, b.pdf');
  });

  it('adds an "and N more" tail when total exceeds the listed names', () => {
    expect(formatPendingNames(['a.pdf', 'b.pdf'], 7)).toBe(
      'a.pdf, b.pdf and 5 more',
    );
  });

  it('handles a single name with no tail', () => {
    expect(formatPendingNames(['a.pdf'], 1)).toBe('a.pdf');
  });
});
