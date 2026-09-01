import { cn } from '@/lib/utils';
import type { DocumentStatus } from '@/lib/domain/document';
import { STATUS_CONFIG } from '@/lib/domain/status-config';

/**
 * Icon and text, never colour alone (WCAG 1.4.1). The icon is also what makes
 * the statuses distinguishable in a screenshot printed in greyscale, which is
 * how half of these things actually get reviewed.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: DocumentStatus;
  className?: string;
}) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        config.className,
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn('size-3.5 shrink-0', config.inFlight && 'animate-pulse')}
      />
      {config.label}
    </span>
  );
}
