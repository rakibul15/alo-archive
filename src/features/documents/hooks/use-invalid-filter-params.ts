'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { findInvalidFilterParams } from '../lib/invalid-filter-params';

/**
 * Which filter keys in the current URL don't parse, and whether that's worth
 * telling the operator about right now.
 *
 * Falling back to defaults on a bad value is still correct — see
 * `invalid-filter-params.ts`. This only adds the missing feedback: a link
 * with a typo'd or since-renamed status used to return the entire unfiltered
 * archive in total silence.
 */
export function useInvalidFilterParams(): {
  invalidKeys: string[];
  dismiss: () => void;
} {
  const searchParams = useSearchParams();
  const invalidKeys = findInvalidFilterParams(searchParams);
  const signature = invalidKeys.join(',');

  const [dismissedSignature, setDismissedSignature] = useState<string | null>(
    null,
  );

  return {
    // Re-editing the URL to point at a *different* invalid value re-shows the
    // banner even if an earlier one was dismissed — dismissal is keyed to the
    // specific set of bad keys, not "ever dismissed this session."
    invalidKeys: signature === dismissedSignature ? [] : invalidKeys,
    dismiss: () => {
      setDismissedSignature(signature);
    },
  };
}
