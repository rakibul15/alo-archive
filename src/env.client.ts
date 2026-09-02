import { z } from 'zod';

/**
 * Client-side configuration.
 *
 * `NEXT_PUBLIC_*` variables are substituted literally at build time, so each
 * one has to be referenced statically — `process.env[name]` silently yields
 * `undefined` in the browser bundle. Hence, the explicit object below rather
 * than handing `process.env` to Zod the way the server module does.
 */
const clientEnvSchema = z.object({
  /** Rows per page request. Also, the visualiser's fetch granularity. */
  NEXT_PUBLIC_PAGE_SIZE: z.coerce.number().int().min(20).max(500).default(100),
  /** Concurrent uploads in flight. Browsers cap ~6 per origin anyway. */
  NEXT_PUBLIC_MAX_PARALLEL_UPLOADS: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .default(6),
  /** Attempts per file before it is parked as failed. */
  NEXT_PUBLIC_MAX_UPLOAD_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3),
});

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_PAGE_SIZE: process.env.NEXT_PUBLIC_PAGE_SIZE,
  NEXT_PUBLIC_MAX_PARALLEL_UPLOADS:
    process.env.NEXT_PUBLIC_MAX_PARALLEL_UPLOADS,
  NEXT_PUBLIC_MAX_UPLOAD_ATTEMPTS: process.env.NEXT_PUBLIC_MAX_UPLOAD_ATTEMPTS,
});

if (!parsed.success) {
  console.warn(
    '[env.client] Ignoring invalid values and falling back to defaults:',
    z.flattenError(parsed.error).fieldErrors,
  );
}

export const clientEnv = parsed.success
  ? parsed.data
  : clientEnvSchema.parse({});
