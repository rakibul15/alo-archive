import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColumnResizeHandle } from './column-resize-handle';

// This project's vitest config doesn't run in `globals` mode (every test
// file imports `describe`/`it`/`expect` explicitly), so
// `@testing-library/react`'s automatic per-test cleanup — which relies on
// detecting a global `afterEach` — never registers. Without this, each
// `render()` below would leave its previous siblings' DOM mounted,
// producing "multiple elements found" failures from `getByRole`.
afterEach(cleanup);

/**
 * The one component-level (not pure-function) test in this codebase — see
 * the extended note in the commit that added it. Short version: this is
 * exactly the "hook/component wiring" this project's testing philosophy
 * normally leaves to browser QA, but the environment this was built in hit
 * a harness-level fault where clicks and drags weren't reaching the page at
 * all (confirmed independently of this component — even a plain nav-link
 * click silently failed), making that verification path unavailable. A
 * jsdom-based test doesn't depend on real screen coordinates or an actual
 * browser at all, which is exactly what made it possible to verify this
 * component's pointer/keyboard logic here instead.
 */
describe('ColumnResizeHandle', () => {
  it('reports incremental deltas while dragging, not the total', () => {
    const onResize = vi.fn();
    render(
      <ColumnResizeHandle
        column="status"
        label="Status"
        width={144}
        onResize={onResize}
        onReset={vi.fn()}
      />,
    );
    const handle = screen.getByRole('separator');

    fireEvent.pointerDown(handle, { clientX: 100, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 130 });
    fireEvent.pointerMove(handle, { clientX: 140 });

    expect(onResize).toHaveBeenNthCalledWith(1, 'status', 30);
    expect(onResize).toHaveBeenNthCalledWith(2, 'status', 10);
  });

  it('ignores a non-primary (e.g. right) button', () => {
    const onResize = vi.fn();
    render(
      <ColumnResizeHandle
        column="status"
        label="Status"
        width={144}
        onResize={onResize}
        onReset={vi.fn()}
      />,
    );
    const handle = screen.getByRole('separator');

    fireEvent.pointerDown(handle, { clientX: 100, button: 2 });
    fireEvent.pointerMove(handle, { clientX: 130 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it('stops reporting moves once the pointer is released', () => {
    const onResize = vi.fn();
    render(
      <ColumnResizeHandle
        column="status"
        label="Status"
        width={144}
        onResize={onResize}
        onReset={vi.fn()}
      />,
    );
    const handle = screen.getByRole('separator');

    fireEvent.pointerDown(handle, { clientX: 100, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 130 });
    fireEvent.pointerUp(handle, { clientX: 130 });
    fireEvent.pointerMove(handle, { clientX: 200 });

    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('Escape mid-drag sends back the exact negative of what was already applied', () => {
    const onResize = vi.fn();
    render(
      <ColumnResizeHandle
        column="uploaded"
        label="Uploaded"
        width={144}
        onResize={onResize}
        onReset={vi.fn()}
      />,
    );
    const handle = screen.getByRole('separator');

    fireEvent.pointerDown(handle, { clientX: 100, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 130 }); // +30
    fireEvent.pointerMove(handle, { clientX: 115 }); // -15, total so far: +15
    fireEvent.keyDown(handle, { key: 'Escape' });

    expect(onResize).toHaveBeenNthCalledWith(1, 'uploaded', 30);
    expect(onResize).toHaveBeenNthCalledWith(2, 'uploaded', -15);
    expect(onResize).toHaveBeenNthCalledWith(3, 'uploaded', -15); // undoes the net +15

    // The cancelled drag shouldn't still be "live" afterwards.
    onResize.mockClear();
    fireEvent.pointerMove(handle, { clientX: 500 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('Escape when not dragging does nothing (nothing to cancel)', () => {
    const onResize = vi.fn();
    render(
      <ColumnResizeHandle
        column="status"
        label="Status"
        width={144}
        onResize={onResize}
        onReset={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Escape' });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('ArrowRight/ArrowLeft step the width by a fixed amount', () => {
    const onResize = vi.fn();
    render(
      <ColumnResizeHandle
        column="confidence"
        label="Confidence"
        width={144}
        onResize={onResize}
        onReset={vi.fn()}
      />,
    );
    const handle = screen.getByRole('separator');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });

    expect(onResize).toHaveBeenNthCalledWith(1, 'confidence', 12);
    expect(onResize).toHaveBeenNthCalledWith(2, 'confidence', -12);
  });

  it('double-click resets the column', () => {
    const onReset = vi.fn();
    render(
      <ColumnResizeHandle
        column="person"
        label="Name / outcome"
        width={144}
        onResize={vi.fn()}
        onReset={onReset}
      />,
    );
    fireEvent.doubleClick(screen.getByRole('separator'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('has an accessible name that identifies which column it resizes', () => {
    render(
      <ColumnResizeHandle
        column="person"
        label="Name / outcome"
        width={144}
        onResize={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('separator', { name: 'Resize Name / outcome column' }),
    ).toBeInTheDocument();
  });
});
