import { cn } from '@/lib/utils';
import { confidenceBand } from '@/lib/domain/document';
import { CONFIDENCE_CONFIG } from '@/lib/domain/status-config';

const percent = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/**
 * Uncertainty is shown, not hidden — the brief is explicit about that. A null
 * confidence is "not extracted yet", which is a different statement from "0%
 * confident", and the two must not render the same way.
 */
export function ConfidenceIndicator({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  const band = confidenceBand(value);
  const config = CONFIDENCE_CONFIG[band];

  if (value === null) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        <span aria-hidden>—</span>
        <span className="sr-only">Not extracted</span>
      </span>
    );
  }

  return (
    <span
      className={cn('flex items-center gap-2', className)}
      title={`${config.label} confidence`}
    >
      <span
        aria-hidden
        className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn(
            'block h-full rounded-full bg-current',
            config.className,
          )}
          style={{ width: `${Math.max(value * 100, 4)}%` }}
        />
      </span>
      <span className={cn('text-sm tabular-nums', config.className)}>
        {percent.format(value)}
      </span>
      <span className="sr-only">{config.label} confidence</span>
    </span>
  );
}
