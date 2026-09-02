import { z } from 'zod';

/**
 * Remembers, across a reload, which server-side upload session belongs to
 * which file.
 *
 * The `File` handle itself still cannot survive a refresh — that hasn't
 * changed and never will (see ASSUMPTIONS.md → assumption 10). What *can*
 * be persisted is the session: so instead of "these 12 files never made it,
 * start again", re-selecting the same file resumes it from the last part
 * the server actually received.
 *
 * Keyed on name+size+lastModified rather than a content hash — hashing a
 * 25 MB file on the main thread to look up a resume token would cost more
 * than re-uploading the parts it saves. The trade: two genuinely different
 * files agreeing on all three fields would collide. The server's own
 * per-part size check is the backstop, and the window is one hour
 * (`SESSION_TTL_MS`).
 */
const resumeEntrySchema = z.object({
  uploadId: z.string(),
  resumeToken: z.string(),
  totalParts: z.number().int().positive(),
  createdAt: z.number(),
});
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;

const resumeMapSchema = z.record(z.string(), resumeEntrySchema);

export const RESUME_STORAGE_KEY = 'alo-archive:upload-sessions';

/** Matches the server's own session TTL — a token older than this is already dead. */
const RESUME_TTL_MS = 60 * 60 * 1000;

export function resumeKeyFor(file: {
  name: string;
  size: number;
  lastModified: number;
}): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Same untrusted-input contract as `parseSavedViews` and `parseColumnWidths`:
 * anything unreadable degrades to "nothing saved" rather than throwing.
 */
export function parseResumeMap(
  raw: string | null,
): Record<string, ResumeEntry> {
  if (raw === null) return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  const parsed = resumeMapSchema.safeParse(json);
  return parsed.success ? parsed.data : {};
}

/** Drops entries past the server's TTL, so a stale token is never even tried. */
export function pruneResumeMap(
  entries: Record<string, ResumeEntry>,
  now = Date.now(),
): Record<string, ResumeEntry> {
  const fresh: Record<string, ResumeEntry> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (now - entry.createdAt <= RESUME_TTL_MS) fresh[key] = entry;
  }
  return fresh;
}

export function readResumeMap(): Record<string, ResumeEntry> {
  if (typeof window === 'undefined') return {};
  return pruneResumeMap(
    parseResumeMap(localStorage.getItem(RESUME_STORAGE_KEY)),
  );
}

function write(entries: Record<string, ResumeEntry>): void {
  localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(entries));
}

export function rememberSession(key: string, entry: ResumeEntry): void {
  if (typeof window === 'undefined') return;
  write({ ...readResumeMap(), [key]: entry });
}

export function forgetSession(key: string): void {
  if (typeof window === 'undefined') return;
  const entries = readResumeMap();
  delete entries[key];
  write(entries);
}
