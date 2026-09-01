import { z } from 'zod';
import { request } from '@/lib/api/client';
import {
  documentRecordSchema,
  documentSummarySchema,
  retryOutcomeSchema,
  type DocumentFilters,
  type ExtractedFieldKey,
  type RetryOutcome,
} from '@/lib/domain/document';

/**
 * Retries either an explicit id list or everything matching the current filter
 * minus a few exceptions. The second form is what makes "retry all failed"
 * possible against a 100,000-row archive without a 100,000-entry request body.
 */
export function retryDocuments(
  input:
    | { kind: 'ids'; ids: string[] }
    | { kind: 'filter'; filter: DocumentFilters; except: string[] },
): Promise<RetryOutcome> {
  return request('/documents/retry', retryOutcomeSchema, {
    method: 'POST',
    body:
      input.kind === 'ids'
        ? { ids: input.ids }
        : { filter: input.filter, except: input.except },
  });
}

export function correctField(input: {
  id: string;
  field: ExtractedFieldKey;
  value: string;
}) {
  return request(`/documents/${input.id}/fields`, documentRecordSchema, {
    method: 'PATCH',
    body: { field: input.field, value: input.value },
  });
}

export function ingestFile(input: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  batchId: string | null;
  signal?: AbortSignal;
}) {
  const { signal, ...body } = input;
  return request('/uploads', documentSummarySchema, {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}

const scaleResultSchema = z.object({
  size: z.number().int(),
  generatedInMs: z.number().int(),
});
export type ScaleResult = z.infer<typeof scaleResultSchema>;

export function scaleArchive(size?: number): Promise<ScaleResult> {
  return request('/scale', scaleResultSchema, {
    method: 'POST',
    body: size === undefined ? {} : { size },
  });
}
