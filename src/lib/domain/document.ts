import { z } from 'zod';

/**
 * The domain model lives as Zod schemas and every TypeScript type is derived
 * from them with `z.infer`. The brief left the data model open, so it is going
 * to move — schema-first means one edit propagates to the types, the API
 * validation and the fixture generator at the same time.
 */

/* -------------------------------------------------------------------------
 * Lifecycle
 * ---------------------------------------------------------------------- */

/**
 * `pending` / `processing` / `completed` / `failed` are the brief's own words
 * and are kept verbatim. Two are ours:
 *
 * - `uploading`  — the client-side leg, before the server has the bytes.
 * - `needs_review` — processed, but the extraction is not trustworthy enough
 *   to use unchecked. This is deliberately *not* a flavour of `completed`:
 *   "done" and "done but you should look at it" are different jobs for the
 *   person doing the work, so they are different states.
 */
export const documentStatusSchema = z.enum([
  'pending',
  'uploading',
  'processing',
  'completed',
  'needs_review',
  'failed',
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const DOCUMENT_STATUSES = documentStatusSchema.options;

/** Statuses that will not change again without user action. */
export const TERMINAL_STATUSES = [
  'completed',
  'needs_review',
  'failed',
] as const satisfies readonly DocumentStatus[];

export const documentTypeSchema = z.enum([
  'enrollment_form',
  'medical_intake',
  'id_scan',
  'handwritten_note',
  'consent_form',
  'unknown',
]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const DOCUMENT_TYPES = documentTypeSchema.options;

/* -------------------------------------------------------------------------
 * Extraction
 * ---------------------------------------------------------------------- */

export const fieldStatusSchema = z.enum([
  'ok',
  'low_confidence',
  'missing',
  'corrected',
]);
export type FieldStatus = z.infer<typeof fieldStatusSchema>;

/**
 * Confidence is per field, not per document. A scanned intake sheet can have a
 * perfectly legible name next to a smudged phone number; collapsing that into
 * one number per document throws away the only information that tells the
 * operator *where* to look.
 */
export const fieldValueSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  status: fieldStatusSchema,
  /** What OCR thought it saw, kept so a correction can be compared to it. */
  raw: z.string().nullable(),
});
export type FieldValue = z.infer<typeof fieldValueSchema>;

export const extractedFieldsSchema = z.object({
  personName: fieldValueSchema,
  phone: fieldValueSchema,
  location: fieldValueSchema,
  programName: fieldValueSchema,
  documentDate: fieldValueSchema,
  documentType: fieldValueSchema,
});
export type ExtractedFields = z.infer<typeof extractedFieldsSchema>;

export const EXTRACTED_FIELD_KEYS = [
  'personName',
  'phone',
  'location',
  'programName',
  'documentDate',
  'documentType',
] as const satisfies readonly (keyof ExtractedFields)[];

export type ExtractedFieldKey = (typeof EXTRACTED_FIELD_KEYS)[number];

export const FIELD_LABELS = {
  personName: 'Name',
  phone: 'Phone',
  location: 'Location',
  programName: 'Programme',
  documentDate: 'Document date',
  documentType: 'Document type',
} as const satisfies Record<ExtractedFieldKey, string>;

/** Below this, a field is flagged rather than shown as fact. */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;
/** Below this, the whole document is routed to `needs_review`. */
export const REVIEW_THRESHOLD = 0.75;

/**
 * A record is only as trustworthy as its weakest field, so the headline number
 * is the minimum rather than the mean — an average would let five good fields
 * hide one unreadable phone number.
 */
export function overallConfidence(fields: ExtractedFields): number {
  return Math.min(...EXTRACTED_FIELD_KEYS.map((key) => fields[key].confidence));
}

export const confidenceBandSchema = z.enum(['high', 'medium', 'low', 'none']);
export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;

export function confidenceBand(value: number | null): ConfidenceBand {
  if (value === null) return 'none';
  if (value >= 0.9) return 'high';
  if (value >= LOW_CONFIDENCE_THRESHOLD) return 'medium';
  return 'low';
}

/* -------------------------------------------------------------------------
 * Failure
 * ---------------------------------------------------------------------- */

export const processingErrorCodeSchema = z.enum([
  'UNSUPPORTED_FORMAT',
  'CORRUPT_FILE',
  'PASSWORD_PROTECTED',
  'PAGE_LIMIT_EXCEEDED',
  'OCR_TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
]);
export type ProcessingErrorCode = z.infer<typeof processingErrorCodeSchema>;

/**
 * Retryability is a property of the error, not a flag someone remembers to
 * set. Retrying a password-protected PDF will fail identically every time, and
 * offering the button anyway teaches the operator to distrust the button.
 */
export const ERROR_CATALOGUE = {
  UNSUPPORTED_FORMAT: {
    retryable: false,
    title: 'Unsupported file type',
    detail: 'This format cannot be processed. Convert it to PDF or JPEG.',
  },
  CORRUPT_FILE: {
    retryable: false,
    title: 'File is unreadable',
    detail: 'The file appears truncated or corrupt. Re-scan the original.',
  },
  PASSWORD_PROTECTED: {
    retryable: false,
    title: 'Password protected',
    detail: 'Remove the password before uploading.',
  },
  PAGE_LIMIT_EXCEEDED: {
    retryable: false,
    title: 'Too many pages',
    detail: 'Documents over 50 pages must be split before upload.',
  },
  OCR_TIMEOUT: {
    retryable: true,
    title: 'Processing timed out',
    detail:
      'The extraction service took too long. This usually succeeds on a retry.',
  },
  UPSTREAM_UNAVAILABLE: {
    retryable: true,
    title: 'Service unavailable',
    detail: 'The extraction service was unreachable. Safe to retry.',
  },
} as const satisfies Record<
  ProcessingErrorCode,
  { retryable: boolean; title: string; detail: string }
>;

export const RETRYABLE_ERROR_CODES = processingErrorCodeSchema.options.filter(
  (code) => ERROR_CATALOGUE[code].retryable,
);

export const processingErrorSchema = z.object({
  code: processingErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  occurredAt: z.string(),
  attempts: z.number().int().nonnegative(),
});
export type ProcessingError = z.infer<typeof processingErrorSchema>;

/* -------------------------------------------------------------------------
 * Records
 * ---------------------------------------------------------------------- */

/**
 * What the table needs. Kept deliberately narrow: at 100,000 rows the
 * difference between shipping this and shipping the full record is the
 * difference between a 30 KB page response and a 400 KB one.
 */
export const documentSummarySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  status: documentStatusSchema,
  documentType: documentTypeSchema,
  personName: z.string().nullable(),
  location: z.string().nullable(),
  programName: z.string().nullable(),
  uploadedAt: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  errorCode: processingErrorCodeSchema.nullable(),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

/** What the detail panel needs. Fetched one at a time, so it can be fat. */
export const documentRecordSchema = documentSummarySchema.extend({
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string(),
  pageCount: z.number().int().positive().nullable(),
  processedAt: z.string().nullable(),
  batchId: z.string().nullable(),
  error: processingErrorSchema.nullable(),
  /** Null until processing has produced something. */
  extracted: extractedFieldsSchema.nullable(),
});
export type DocumentRecord = z.infer<typeof documentRecordSchema>;

/* -------------------------------------------------------------------------
 * Queries
 * ---------------------------------------------------------------------- */

export const documentSortSchema = z.enum([
  'uploadedAt',
  'fileName',
  'confidence',
  'status',
]);
export type DocumentSort = z.infer<typeof documentSortSchema>;
export const DOCUMENT_SORTS = documentSortSchema.options;

export const sortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirectionSchema>;
export const SORT_DIRECTIONS = sortDirectionSchema.options;

export const confidenceFilterSchema = z.enum(['any', 'high', 'medium', 'low']);
export type ConfidenceFilter = z.infer<typeof confidenceFilterSchema>;
export const CONFIDENCE_FILTERS = confidenceFilterSchema.options;

export const documentFiltersSchema = z.object({
  q: z.string().default(''),
  status: z.array(documentStatusSchema).default([]),
  type: z.array(documentTypeSchema).default([]),
  confidence: confidenceFilterSchema.default('any'),
  sort: documentSortSchema.default('uploadedAt'),
  dir: sortDirectionSchema.default('desc'),
});
export type DocumentFilters = z.infer<typeof documentFiltersSchema>;

export const DEFAULT_FILTERS: DocumentFilters = documentFiltersSchema.parse({});

export const documentPageSchema = z.object({
  items: z.array(documentSummarySchema),
  /** Opaque; `null` means this was the last page. */
  nextCursor: z.string().nullable(),
  /** Rows matching the current filter, not the size of the archive. */
  matchedCount: z.number().int().nonnegative(),
  /** Size of the archive, so the UI can say "312 of 100,000". */
  totalCount: z.number().int().nonnegative(),
});
export type DocumentPage = z.infer<typeof documentPageSchema>;

export const statusCountsSchema = z.record(documentStatusSchema, z.number());
export type StatusCounts = z.infer<typeof statusCountsSchema>;

export const archiveSummarySchema = z.object({
  counts: statusCountsSchema,
  totalCount: z.number().int().nonnegative(),
  /** Documents finishing per second, averaged over the last few ticks. */
  throughput: z.number().nonnegative(),
});
export type ArchiveSummary = z.infer<typeof archiveSummarySchema>;
