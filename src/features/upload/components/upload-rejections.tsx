'use client';

import { useState } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ACCEPTED_EXTENSIONS_LABEL } from '@/lib/domain/upload-constraints';
import { formatBytes } from '../lib/format';
import { useUploadStore, type RejectionReason } from '../store';

const numberFormat = new Intl.NumberFormat('en-GB');

const REASON_LABELS: Record<RejectionReason, string> = {
  unsupported_type: `not ${ACCEPTED_EXTENSIONS_LABEL}`,
  too_large: 'larger than 25 MB',
  other: 'could not be read',
};

const REASON_ORDER: readonly RejectionReason[] = [
  'unsupported_type',
  'too_large',
  'other',
];

/**
 * What the dropzone refused, and why.
 *
 * Dropping a folder of 300 and quietly enqueuing 288 is the worst kind of
 * failure: it looks like success. The operator has no way to know twelve
 * documents from the field never entered the archive until somebody notices
 * the gap months later.
 */
export function UploadRejections() {
  const rejections = useUploadStore((state) => state.rejections);
  const rejectedCount = useUploadStore((state) => state.rejectedCount);
  const byReason = useUploadStore((state) => state.rejectedByReason);
  const dismiss = useUploadStore((state) => state.dismissRejections);
  const [isExpanded, setIsExpanded] = useState(false);

  if (rejectedCount === 0) return null;

  // From the store's exact tally, not from `rejections` — that list is capped,
  // and a breakdown that does not sum to the headline is worse than none.
  const breakdown = REASON_ORDER.filter((reason) => byReason[reason] > 0).map(
    (reason) =>
      `${numberFormat.format(byReason[reason])} ${REASON_LABELS[reason]}`,
  );

  return (
    <Alert>
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>
        {numberFormat.format(rejectedCount)} file
        {rejectedCount === 1 ? '' : 's'} were not added
      </AlertTitle>
      <AlertDescription>
        <p>{breakdown.join(', ')}. Nothing else in the batch was affected.</p>

        {isExpanded ? (
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
            {rejections.map((rejection) => (
              <li
                key={`${rejection.name}-${rejection.size}`}
                className="truncate"
              >
                <span className="font-mono">{rejection.name}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {formatBytes(rejection.size)} ·{' '}
                  {REASON_LABELS[rejection.reason]}
                </span>
              </li>
            ))}
            {rejectedCount > rejections.length ? (
              <li className="text-muted-foreground">
                …and {numberFormat.format(rejectedCount - rejections.length)}{' '}
                more
              </li>
            ) : null}
          </ul>
        ) : null}

        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsExpanded((value) => !value);
            }}
          >
            {isExpanded ? 'Hide list' : 'Which files?'}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
