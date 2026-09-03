const UNITS = ['B', 'kB', 'MB', 'GB'] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const suffix = UNITS[unit] ?? 'B';
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${suffix}`;
}

/** Coarse on purpose: a to-the-second estimate that keeps changing is noise. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(seconds, 1)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * "invoice.pdf, scan-2.pdf and 3 more" — `names` is already capped to what
 * the caller is willing to list; `total` is the real count, which can be
 * larger. Used for the interrupted-batch banner, where the point is telling
 * the operator what to go and find, not just how many.
 */
export function formatPendingNames(
  names: readonly string[],
  total: number,
): string {
  const remaining = total - names.length;
  const listed = names.join(', ');
  return remaining > 0 ? `${listed} and ${remaining} more` : listed;
}
