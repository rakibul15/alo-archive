import { z } from 'zod';
import { request } from '@/lib/api/client';
import {
  documentRecordSchema,
  documentSummarySchema,
  type ExtractedFieldKey,
} from '@/lib/domain/document';

const retryResultSchema = z.object({
  retried: z.array(z.string()),
  refused: z.array(z.string()),
});
export type RetryResult = z.infer<typeof retryResultSchema>;

export function retryDocuments(ids: readonly string[]): Promise<RetryResult> {
  return request('/documents/retry', retryResultSchema, {
    method: 'POST',
    body: { ids },
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
