import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps unrelated classes', () => {
    expect(cn('text-sm', 'font-medium')).toBe('text-sm font-medium');
  });

  it('lets a later class of the same kind win, as tailwind-merge is meant to', () => {
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
  });

  /**
   * Regression guard for a real bug (see `document-preview.tsx`).
   *
   * `tailwind-merge` groups any `fill-*` colour utility together with
   * `fill-opacity-*` as a single conflicting group, so `cn('fill-status-x',
   * 'fill-opacity-0')` silently drops the colour class and keeps only the
   * opacity one. Worse, standalone `fill-opacity-*` utilities do not exist in
   * Tailwind v4 at all — the class survives the merge but compiles to no CSS —
   * so the net effect was every SVG shape falling back to the browser default
   * fill, opaque black, regardless of the colour utility that was supposedly
   * applied.
   *
   * The fix is Tailwind's slash-opacity syntax (`fill-status-x/0`), which
   * folds the opacity into the same utility as the colour rather than a
   * second one twMerge can silently prefer.
   */
  it('does not let a bare fill-opacity utility erase a custom fill colour', () => {
    const broken = cn(
      'fill-status-uploading stroke-status-uploading',
      'fill-opacity-0',
    );
    expect(broken).not.toContain('fill-status-uploading');
  });

  it('keeps the fill colour when opacity rides along via the slash syntax', () => {
    const fixed = cn('stroke-status-uploading', 'fill-status-uploading/0');
    expect(fixed).toContain('fill-status-uploading/0');
    expect(fixed).toContain('stroke-status-uploading');
  });
});
