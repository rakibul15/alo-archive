import { archive } from '@/server/archive';

/**
 * Deliberately not latency-padded: this drives the live status counters and
 * should feel instant next to the list, which is padded.
 */
export function GET() {
  return Response.json(archive.summary());
}
