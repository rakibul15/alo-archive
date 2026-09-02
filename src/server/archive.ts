import 'server-only';
import { env } from '@/env';
import {
  ERROR_CATALOGUE,
  EXTRACTED_FIELD_KEYS,
  REVIEW_THRESHOLD,
  emptyRetryOutcome,
  overallConfidence,
  type ArchiveSummary,
  type DocumentFilters,
  type DocumentPage,
  type DocumentRecord,
  type DocumentStatus,
  type DocumentSummary,
  type DocumentType,
  type ExtractedFieldKey,
  type ExtractedFields,
  type ProcessingErrorCode,
  type RetryOutcome,
  type StatusCounts,
} from '@/lib/domain/document';
import { DOCUMENT_STATUSES } from '@/lib/domain/document';
import { assertNever } from '@/lib/assert';
import {
  buildExtractedFields,
  deriveCore,
  documentId,
  searchTextFor,
  type DocumentCore,
} from './fixtures/generate';
import { chance, intBetween, rngFor } from './fixtures/random';

/**
 * The archive index.
 *
 * One flat, mutable row per document holding only what filtering, sorting and
 * the table itself need. Full records — including the six nested extraction
 * objects — are materialised on demand for the ~100 rows actually returned by
 * a page request, or for the single row behind a detail view. At 100,000
 * documents that is the difference between ~700,000 live objects and ~100.
 */
type IndexRow = {
  index: number;
  id: string;
  status: DocumentStatus;
  documentType: DocumentType;
  confidence: number | null;
  uploadedAtMs: number;
  processedAtMs: number | null;
  errorCode: ProcessingErrorCode | null;
  attempts: number;
  degraded: boolean;
  fileName: string;
  search: string;
  /** Set for documents uploaded in this session rather than synthesised. */
  upload: { fileName: string; fileSize: number; mimeType: string } | null;
  /** Human corrections, applied over the extracted values. */
  corrections: Partial<Record<ExtractedFieldKey, string>> | null;
  /** When the simulation should move this row on. Null once terminal. */
  dueAtMs: number | null;
  batchId: string | null;
};

type ChangeEntry = { rev: number; id: string };

const CHANGE_LOG_LIMIT = 4_000;

class Archive {
  private rows: IndexRow[] = [];
  private byId = new Map<string, IndexRow>();
  private changeLog: ChangeEntry[] = [];
  private revision = 0;
  private completionTimes: number[] = [];

  /**
   * Fixed anchor for generated timestamps, so the corpus is identical across
   * reloads within a run and screenshots stay reproducible.
   */
  private readonly anchorMs = Math.floor(Date.now() / 3_600_000) * 3_600_000;

  constructor() {
    this.grow(env.SIM_SEED_CORPUS_SIZE);
  }

  /* --------------------------------------------------------------------
   * Corpus construction
   * ------------------------------------------------------------------ */

  get size(): number {
    return this.rows.length;
  }

  /** Extends the archive to `target` documents. Never shrinks. */
  grow(target: number): number {
    const now = Date.now();
    for (let index = this.rows.length; index < target; index++) {
      const core = deriveCore(index, this.anchorMs);
      const row = this.seedRow(core, now);
      this.rows.push(row);
      this.byId.set(row.id, row);
    }
    return this.rows.length;
  }

  private seedRow(core: DocumentCore, now: number): IndexRow {
    const rng = rngFor(core.index, 0x2545f491);
    const degraded = chance(rng, env.SIM_REVIEW_RATE);
    const failed = chance(rng, env.SIM_FAILURE_RATE);

    // A small slice of the seeded archive is still moving, so the dashboard is
    // not a wall of terminal states the moment the app opens.
    const inFlight = chance(rng, 0.02);

    const base: IndexRow = {
      index: core.index,
      id: core.id,
      status: 'completed',
      documentType: core.documentType,
      confidence: null,
      uploadedAtMs: core.uploadedAtMs,
      processedAtMs: null,
      errorCode: null,
      attempts: 0,
      degraded,
      fileName: core.fileName,
      search: searchTextFor(core),
      upload: null,
      corrections: null,
      dueAtMs: null,
      batchId: null,
    };

    if (inFlight) {
      base.status = chance(rng, 0.5) ? 'pending' : 'processing';
      base.dueAtMs = now + intBetween(rng, 0, env.SIM_LATENCY_MAX_MS);
      return base;
    }

    if (failed) {
      base.status = 'failed';
      base.errorCode = core.failureCode;
      base.attempts = 1;
      base.processedAtMs = core.uploadedAtMs + intBetween(rng, 500, 9_000);
      return base;
    }

    base.processedAtMs = core.uploadedAtMs + intBetween(rng, 500, 12_000);
    return this.settle(base, core, degraded);
  }

  /** Moves a row to its terminal processed state and fills in confidence. */
  private settle(
    row: IndexRow,
    core: DocumentCore,
    degraded: boolean,
  ): IndexRow {
    // The nested field objects are built and thrown away here; only the single
    // aggregate number is retained in the index.
    const confidence = overallConfidence(buildExtractedFields(core, degraded));
    row.confidence = confidence;
    row.status = confidence < REVIEW_THRESHOLD ? 'needs_review' : 'completed';
    row.errorCode = null;
    row.dueAtMs = null;
    row.processedAtMs ??= Date.now();
    return row;
  }

  private core(row: IndexRow): DocumentCore {
    const core = deriveCore(row.index, this.anchorMs);
    if (row.upload) {
      return {
        ...core,
        fileName: row.upload.fileName,
        fileSize: row.upload.fileSize,
        mimeType: row.upload.mimeType,
      };
    }
    return core;
  }

  /* --------------------------------------------------------------------
   * Simulation
   *
   * There is no background timer. `advance()` is called at the top of every
   * read, so the simulation only moves while somebody is looking at it and
   * nothing keeps ticking after the last client disconnects.
   * ------------------------------------------------------------------ */

  advance(now = Date.now()): string[] {
    const changed: string[] = [];

    for (const row of this.rows) {
      if (row.dueAtMs === null || row.dueAtMs > now) continue;

      const rng = rngFor(row.index + row.attempts * 7919, 0x27d4eb2f);
      const core = this.core(row);

      switch (row.status) {
        case 'pending':
        case 'uploading': {
          row.status = 'processing';
          row.dueAtMs =
            now +
            intBetween(rng, env.SIM_LATENCY_MIN_MS, env.SIM_LATENCY_MAX_MS);
          break;
        }
        case 'processing': {
          if (chance(rng, env.SIM_FAILURE_RATE)) {
            row.status = 'failed';
            row.errorCode = core.failureCode;
            row.attempts += 1;
            row.processedAtMs = now;
            row.dueAtMs = null;
          } else {
            row.processedAtMs = now;
            this.settle(row, core, chance(rng, env.SIM_REVIEW_RATE));
            this.completionTimes.push(now);
          }
          break;
        }
        case 'completed':
        case 'needs_review':
        case 'failed': {
          row.dueAtMs = null;
          break;
        }
        default:
          assertNever(row.status, 'document status');
      }

      changed.push(row.id);
      this.recordChange(row.id);
    }

    return changed;
  }

  private recordChange(id: string): void {
    this.revision += 1;
    this.changeLog.push({ rev: this.revision, id });
    if (this.changeLog.length > CHANGE_LOG_LIMIT) {
      this.changeLog.splice(0, this.changeLog.length - CHANGE_LOG_LIMIT);
    }
  }

  get currentRevision(): number {
    return this.revision;
  }

  /**
   * Ids touched since `sinceRev`, de-duplicated. Clients receive identifiers
   * only — never whole documents — so a burst of activity across a 100,000-row
   * archive costs a few hundred bytes rather than megabytes.
   */
  changesSince(sinceRev: number): { rev: number; ids: string[] } {
    const ids = new Set<string>();
    for (const entry of this.changeLog) {
      if (entry.rev > sinceRev) ids.add(entry.id);
    }
    return { rev: this.revision, ids: [...ids] };
  }

  /* --------------------------------------------------------------------
   * Reads
   * ------------------------------------------------------------------ */

  summary(): ArchiveSummary {
    this.advance();

    const counts = Object.fromEntries(
      DOCUMENT_STATUSES.map((status) => [status, 0]),
    ) as StatusCounts;

    for (const row of this.rows) counts[row.status] += 1;

    const cutoff = Date.now() - 10_000;
    this.completionTimes = this.completionTimes.filter((t) => t >= cutoff);

    return {
      counts,
      totalCount: this.rows.length,
      throughput: this.completionTimes.length / 10,
    };
  }

  list(
    filters: DocumentFilters,
    cursor: string | null,
    limit: number,
  ): DocumentPage {
    this.advance();

    const matched = this.rows.filter((row) => this.matches(row, filters));
    matched.sort((a, b) => compareRows(a, b, filters));

    const start = cursor ? findCursorPosition(matched, cursor, filters) : 0;
    const slice = matched.slice(start, start + limit);
    const last = slice.at(-1);

    return {
      items: slice.map((row) => this.toSummary(row)),
      nextCursor:
        last && start + limit < matched.length
          ? encodeCursor(last, filters)
          : null,
      matchedCount: matched.length,
      totalCount: this.rows.length,
    };
  }

  private matches(row: IndexRow, filters: DocumentFilters): boolean {
    if (filters.status.length > 0 && !filters.status.includes(row.status)) {
      return false;
    }
    if (filters.type.length > 0 && !filters.type.includes(row.documentType)) {
      return false;
    }
    if (filters.confidence !== 'any') {
      const value = row.confidence;
      if (value === null) return false;
      if (filters.confidence === 'high' && value < 0.9) return false;
      if (
        filters.confidence === 'medium' &&
        (value < REVIEW_THRESHOLD || value >= 0.9)
      ) {
        return false;
      }
      if (filters.confidence === 'low' && value >= REVIEW_THRESHOLD) {
        return false;
      }
    }
    if (filters.q.trim() !== '') {
      if (!row.search.includes(filters.q.trim().toLowerCase())) return false;
    }
    return true;
  }

  get(id: string): DocumentRecord | null {
    this.advance();
    const row = this.byId.get(id);
    if (!row) return null;

    const core = this.core(row);
    const summary = this.toSummary(row);

    return {
      ...summary,
      fileSize: core.fileSize,
      mimeType: core.mimeType,
      pageCount: core.pageCount,
      processedAt: row.processedAtMs
        ? new Date(row.processedAtMs).toISOString()
        : null,
      batchId: row.batchId,
      error: row.errorCode
        ? {
            code: row.errorCode,
            message: ERROR_CATALOGUE[row.errorCode].detail,
            retryable: ERROR_CATALOGUE[row.errorCode].retryable,
            occurredAt: new Date(row.processedAtMs ?? Date.now()).toISOString(),
            attempts: row.attempts,
          }
        : null,
      extracted: this.extractedFor(row, core),
    } satisfies DocumentRecord;
  }

  private extractedFor(
    row: IndexRow,
    core: DocumentCore,
  ): ExtractedFields | null {
    if (row.status === 'failed') return null;
    if (row.status === 'pending' || row.status === 'uploading') return null;
    if (row.status === 'processing') return null;

    const fields = buildExtractedFields(core, row.degraded);
    if (!row.corrections) return fields;

    const corrected: ExtractedFields = { ...fields };
    for (const key of EXTRACTED_FIELD_KEYS) {
      const value = row.corrections[key];
      if (value === undefined) continue;
      corrected[key] = {
        value,
        confidence: 1,
        status: 'corrected',
        raw: fields[key].raw ?? fields[key].value,
        // The correction replaces the value, not the place it came from.
        box: fields[key].box,
      };
    }
    return corrected;
  }

  private toSummary(row: IndexRow): DocumentSummary {
    const core = this.core(row);
    const name = row.corrections?.personName ?? core.personName;
    const revealed =
      row.status === 'completed' || row.status === 'needs_review';

    return {
      id: row.id,
      fileName: row.upload?.fileName ?? core.fileName,
      status: row.status,
      documentType: row.documentType,
      personName: revealed ? name : null,
      location: revealed ? core.location : null,
      programName: revealed ? core.programName : null,
      uploadedAt: new Date(row.uploadedAtMs).toISOString(),
      confidence: row.confidence,
      errorCode: row.errorCode,
    };
  }

  /* --------------------------------------------------------------------
   * Writes
   * ------------------------------------------------------------------ */

  /** Registers an uploaded file and puts it at the head of the queue. */
  enqueue(input: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    batchId: string | null;
  }): DocumentSummary {
    const index = this.rows.length;
    const core = deriveCore(index, this.anchorMs);
    const now = Date.now();

    const row: IndexRow = {
      index,
      id: documentId(index),
      status: 'pending',
      documentType: core.documentType,
      confidence: null,
      uploadedAtMs: now,
      processedAtMs: null,
      errorCode: null,
      attempts: 0,
      degraded: chance(rngFor(index, 0x2545f491), env.SIM_REVIEW_RATE),
      fileName: input.fileName,
      search: searchTextFor({ ...core, fileName: input.fileName }),
      upload: {
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
      },
      corrections: null,
      dueAtMs: now + intBetween(rngFor(index), 120, 900),
      batchId: input.batchId,
    };

    this.rows.push(row);
    this.byId.set(row.id, row);
    this.recordChange(row.id);
    return this.toSummary(row);
  }

  /**
   * Re-queues failed documents. Non-retryable failures are refused rather than
   * silently accepted — a password-protected PDF fails identically every time,
   * and a retry button that does nothing teaches people to distrust it.
   */
  retry(ids: readonly string[]): RetryOutcome {
    const rows: IndexRow[] = [];
    const outcome = emptyRetryOutcome();

    for (const id of ids) {
      const row = this.byId.get(id);
      if (!row) {
        outcome.notFound += 1;
        continue;
      }
      rows.push(row);
    }

    return this.retryRows(rows, outcome);
  }

  /**
   * Bulk retry driven by a filter rather than an id list.
   *
   * "Retry every failed document" against a 100,000-row archive must not mean
   * shipping 100,000 ids to the server. The client sends the query it is
   * looking at plus the handful of rows the user unticked, and the set is
   * resolved here where it already lives.
   */
  retryMatching(
    filters: DocumentFilters,
    except: readonly string[],
  ): RetryOutcome {
    const excluded = new Set(except);
    const rows = this.rows.filter(
      (row) => !excluded.has(row.id) && this.matches(row, filters),
    );
    return this.retryRows(rows, emptyRetryOutcome());
  }

  private retryRows(
    rows: readonly IndexRow[],
    outcome: RetryOutcome,
  ): RetryOutcome {
    const now = Date.now();

    for (const row of rows) {
      if (row.status !== 'failed' || !row.errorCode) {
        outcome.notFailed += 1;
        continue;
      }
      if (!ERROR_CATALOGUE[row.errorCode].retryable) {
        // Counted by reason, so the UI can say *why* rather than just "some
        // could not be retried".
        outcome.refusedByCode[row.errorCode] += 1;
        outcome.refused += 1;
        continue;
      }
      row.status = 'pending';
      row.errorCode = null;
      row.processedAtMs = null;
      row.dueAtMs =
        now + intBetween(rngFor(row.index + row.attempts), 150, 900);
      outcome.retried += 1;
      this.recordChange(row.id);
    }

    return outcome;
  }

  /**
   * Applies a human correction. The corrected field is pinned to full
   * confidence, and if that lifts the document above the review threshold it
   * leaves the review queue on its own.
   */
  correct(
    id: string,
    key: ExtractedFieldKey,
    value: string,
  ): DocumentRecord | null {
    const row = this.byId.get(id);
    if (!row) return null;
    if (row.status !== 'needs_review' && row.status !== 'completed')
      return null;

    row.corrections = { ...row.corrections, [key]: value };

    const fields = this.extractedFor(row, this.core(row));
    if (fields) {
      row.confidence = overallConfidence(fields);
      row.status =
        row.confidence < REVIEW_THRESHOLD ? 'needs_review' : 'completed';
    }

    this.recordChange(id);
    return this.get(id);
  }
}

/* ----------------------------------------------------------------------
 * Sorting and keyset cursors
 * -------------------------------------------------------------------- */

const STATUS_ORDER: Record<DocumentStatus, number> = {
  failed: 0,
  needs_review: 1,
  processing: 2,
  pending: 3,
  uploading: 4,
  completed: 5,
};

type SortKey = string | number;

function sortKeyOf(row: IndexRow, filters: DocumentFilters): SortKey {
  switch (filters.sort) {
    case 'uploadedAt':
      return row.uploadedAtMs;
    case 'fileName':
      return row.fileName;
    case 'confidence':
      // Unprocessed rows sort as the least trustworthy rather than vanishing.
      return row.confidence ?? -1;
    case 'status':
      return STATUS_ORDER[row.status];
    default:
      return assertNever(filters.sort, 'sort key');
  }
}

function compareKeys(a: SortKey, b: SortKey): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function compareRows(
  a: IndexRow,
  b: IndexRow,
  filters: DocumentFilters,
): number {
  const primary = compareKeys(sortKeyOf(a, filters), sortKeyOf(b, filters));
  // Id is the tiebreaker so the ordering is total; without it pagination can
  // drop or repeat rows whose sort keys collide.
  const resolved = primary !== 0 ? primary : a.id.localeCompare(b.id);
  return filters.dir === 'asc' ? resolved : -resolved;
}

function encodeCursor(row: IndexRow, filters: DocumentFilters): string {
  return Buffer.from(
    JSON.stringify({ k: sortKeyOf(row, filters), id: row.id }),
  ).toString('base64url');
}

/**
 * Keyset rather than offset pagination: the cursor carries the sort key of the
 * last row seen, so rows changing status mid-scroll cannot shift the window
 * and make the virtualiser skip or duplicate entries.
 */
function findCursorPosition(
  sorted: readonly IndexRow[],
  cursor: string,
  filters: DocumentFilters,
): number {
  let decoded: { k: SortKey; id: string };
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      k: SortKey;
      id: string;
    };
  } catch {
    return 0;
  }

  const direction = filters.dir === 'asc' ? 1 : -1;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (!row) continue;
    const primary = compareKeys(sortKeyOf(row, filters), decoded.k);
    const resolved = primary !== 0 ? primary : row.id.localeCompare(decoded.id);
    if (resolved * direction > 0) return i;
  }
  return sorted.length;
}

/* ----------------------------------------------------------------------
 * Singleton
 * -------------------------------------------------------------------- */

/**
 * Module state is re-created on every hot reload in development, which would
 * silently reset the archive mid-session and look like a bug. Parking it on
 * `globalThis` keeps it alive across reloads.
 */
const globalRef = globalThis as typeof globalThis & { __aloArchive?: Archive };

export const archive: Archive = (globalRef.__aloArchive ??= new Archive());
export type { Archive };
