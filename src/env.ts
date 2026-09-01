import 'server-only';
import { z } from 'zod';

/**
 * Server-side configuration.
 *
 * Two rules, both aimed at the person cloning this repo:
 *
 * 1. **Everything is optional.** `git clone && npm install && npm run dev` has
 *    to work with no `.env` file at all.
 * 2. **Unknown variables are ignored, and bad ones warn instead of throwing.**
 *    A Zod object strips keys it does not know about, so dropping an existing
 *    `.env` — with `DATABASE_URL`, `OPENAI_API_KEY` or anything else in it —
 *    into this project cannot break the build. A typo in one of *our* keys
 *    falls back to the default and logs, rather than taking the app down.
 *
 * A production service would do the opposite and fail fast on startup. The
 * trade-off is inverted here on purpose: this is a prototype someone else has
 * to be able to run on the first try.
 */
const serverEnvSchema = z.object({
  /** Simulated per-document processing latency, milliseconds. */
  SIM_LATENCY_MIN_MS: z.coerce.number().int().min(0).default(400),
  SIM_LATENCY_MAX_MS: z.coerce.number().int().min(0).default(2600),
  /** Share of documents that end in `failed`. */
  SIM_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.08),
  /** Share of documents that end in `needs_review`. */
  SIM_REVIEW_RATE: z.coerce.number().min(0).max(1).default(0.15),
  /** Documents in the archive when the server starts. */
  SIM_SEED_CORPUS_SIZE: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .default(2_400),
  /** Size the corpus jumps to when "Load 100,000" is used. */
  SIM_SCALE_CORPUS_SIZE: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .default(100_000),
  /** How often the simulation advances in-flight documents. */
  SIM_TICK_MS: z.coerce.number().int().min(50).default(400),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.warn(
    '[env] Ignoring invalid values and falling back to defaults:',
    z.flattenError(parsed.error).fieldErrors,
  );
}

export const env = parsed.success ? parsed.data : serverEnvSchema.parse({});
export type ServerEnv = typeof env;
