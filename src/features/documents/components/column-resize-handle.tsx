'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ResizableColumn } from '../lib/column-widths';

/**
 * The draggable edge of a resizable header cell.
 *
 * Reports *incremental* deltas (distance since the last pointer event, not
 * since the drag started) rather than an absolute width, so this component
 * never has to know or track the column's current size — `useColumnWidths`
 * already owns that, and it would be a second, redundant place for the
 * width to live. `Enter`/`Space` on a keyboard-focused handle isn't
 * intercepted, since `ArrowLeft`/`ArrowRight` are what actually adjust it,
 * matching how a native `<input type="range">` behaves rather than the
 * roving-tabindex convention this table's rows use.
 */
export function ColumnResizeHandle({
  column,
  label,
  onResize,
  onReset,
}: {
  column: ResizableColumn;
  label: string;
  onResize: (column: ResizableColumn, deltaPx: number) => void;
  onReset: () => void;
}) {
  const lastXRef = useRef(0);
  const draggingRef = useRef(false);
  // Sum of every delta already sent to `onResize` this drag — the only way
  // Escape can undo it is to send the exact negative back, since this
  // component never holds the width itself (see above).
  const totalDeltaRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Left click / primary touch only — a right-click shouldn't start a drag.
    if (event.button !== 0) return;
    event.preventDefault();
    lastXRef.current = event.clientX;
    totalDeltaRef.current = 0;
    draggingRef.current = true;
    setIsDragging(true);
    // Capture is what keeps the drag tracking the pointer once it leaves
    // this 8px-wide strip — without it, a fast drag outside the handle's own
    // bounds would stop delivering move events. It can fail for reasons that
    // have nothing to do with whether a drag is actually happening (no
    // active OS-level pointer with this id, e.g.), so a failure here is not
    // a reason to abandon the resize that just started above.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Uncaptured is still draggable, just only while the cursor stays
      // over the handle.
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const delta = event.clientX - lastXRef.current;
    lastXRef.current = event.clientX;
    if (delta !== 0) {
      totalDeltaRef.current += delta;
      onResize(column, delta);
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    // Same reasoning as the try/catch in `onPointerDown`: releasing a
    // capture that was never (or couldn't be) taken isn't an error state
    // for this component, just a no-op.
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Nothing to release.
    }
  };

  const KEYBOARD_STEP = 12;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      tabIndex={0}
      className={cn(
        'absolute inset-y-1 right-0 w-2 shrink-0 translate-x-1/2 -translate-y-0 cursor-col-resize touch-none rounded-full select-none',
        'hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none',
        isDragging && 'bg-primary/60',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onResize(column, -KEYBOARD_STEP);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onResize(column, KEYBOARD_STEP);
        } else if (event.key === 'Escape' && draggingRef.current) {
          // Same convention the field-correction inputs use elsewhere in
          // this app: Escape abandons an in-progress action rather than
          // committing it. A keyboard step, by contrast, already *is*
          // committed the instant it happens — there's no draft state to
          // discard, so Escape only has something to cancel mid-drag.
          event.preventDefault();
          onResize(column, -totalDeltaRef.current);
          totalDeltaRef.current = 0;
          draggingRef.current = false;
          setIsDragging(false);
        }
      }}
    />
  );
}
