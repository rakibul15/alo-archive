'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * `useSyncExternalStore` rather than `useEffect` + `useState`.
 *
 * The naive version renders `false` on the first client paint regardless of
 * the real viewport, which for this app means the desktop table mounts on a
 * phone and is immediately swapped for the card list — a visible flash, a
 * wasted render, and a hydration mismatch warning. `getServerSnapshot`
 * returning `false` makes the server render explicit and stable instead.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => {
        list.removeEventListener('change', onStoreChange);
      };
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below this the table becomes a card list rather than scrolling sideways. */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
