'use client';

import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useInvalidFilterParams } from '../hooks/use-invalid-filter-params';

const LABELS: Record<string, string> = {
  status: 'status',
  type: 'type',
  confidence: 'confidence',
  sort: 'sort',
  dir: 'sort direction',
};

/**
 * Tells the operator when a value in the URL didn't parse, rather than
 * letting it fail silently.
 *
 * The fallback itself is correct and stays: an unrecognised filter value
 * degrades to "show everything" rather than an error page, because a stale
 * bookmark or a link shared last month shouldn't break outright. What was
 * missing was any sign that happened — `?status=Failed` (capitalised) or a
 * status renamed in a later release both used to return the entire
 * unfiltered archive in total silence, which reads as "my filter did
 * nothing" rather than "my filter doesn't exist."
 */
export function InvalidFilterBanner() {
  const { invalidKeys, dismiss } = useInvalidFilterParams();
  if (invalidKeys.length === 0) return null;

  const named = invalidKeys.map((key) => LABELS[key] ?? key);

  return (
    <Alert>
      <CircleAlertIcon aria-hidden />
      <AlertTitle>
        {named.length === 1
          ? `The ${named[0]} filter in this link wasn't recognised`
          : `Some filters in this link weren't recognised (${named.join(', ')})`}
      </AlertTitle>
      <AlertDescription>
        <p>It was ignored — you&rsquo;re seeing the unfiltered list below.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={dismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}
