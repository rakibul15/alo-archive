import { describe, expect, it } from 'vitest';
import {
  ALL_SELECTED,
  EMPTY_SELECTION,
  headerCheckState,
  isSelected,
  selectionCount,
  toggle,
  toggleAll,
  toRequest,
} from './selection';

const MATCHED = 100_000;

describe('include mode', () => {
  it('selects only what was ticked', () => {
    const selection = toggle(toggle(EMPTY_SELECTION, 'a'), 'b');
    expect(isSelected(selection, 'a')).toBe(true);
    expect(isSelected(selection, 'zzz')).toBe(false);
    expect(selectionCount(selection, MATCHED)).toBe(2);
  });

  it('untick removes', () => {
    const selection = toggle(toggle(EMPTY_SELECTION, 'a'), 'a');
    expect(selectionCount(selection, MATCHED)).toBe(0);
  });
});

describe('exclude mode', () => {
  it('represents "select all, deselect three" in three strings', () => {
    let selection = ALL_SELECTED;
    for (const id of ['a', 'b', 'c']) selection = toggle(selection, id);

    expect(selection.ids.size).toBe(3);
    expect(selectionCount(selection, MATCHED)).toBe(99_997);
    expect(isSelected(selection, 'a')).toBe(false);
    expect(isSelected(selection, 'anything-else')).toBe(true);
  });

  it('sends the filter rather than 100,000 ids', () => {
    const selection = toggle(ALL_SELECTED, 'a');
    expect(toRequest(selection)).toEqual({ kind: 'filter', except: ['a'] });
  });
});

describe('header checkbox', () => {
  it('reflects none / some / all', () => {
    expect(headerCheckState(EMPTY_SELECTION, MATCHED)).toBe('unchecked');
    expect(headerCheckState(toggle(EMPTY_SELECTION, 'a'), MATCHED)).toBe(
      'indeterminate',
    );
    expect(headerCheckState(ALL_SELECTED, MATCHED)).toBe('checked');
    expect(headerCheckState(toggle(ALL_SELECTED, 'a'), MATCHED)).toBe(
      'indeterminate',
    );
  });

  it('toggles all on, then all off', () => {
    const all = toggleAll(EMPTY_SELECTION, MATCHED);
    expect(selectionCount(all, MATCHED)).toBe(MATCHED);
    expect(selectionCount(toggleAll(all, MATCHED), MATCHED)).toBe(0);
  });

  it('clears a partial selection rather than extending it', () => {
    // Half-ticked then header-clicked should mean "none", which is what every
    // other table does and what undoes a mis-click.
    const partial = toggle(ALL_SELECTED, 'a');
    expect(selectionCount(toggleAll(partial, MATCHED), MATCHED)).toBe(0);
  });
});
