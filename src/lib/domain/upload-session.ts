import { z } from 'zod';

/**
 * The wire shapes for chunked, resumable upload — the client's stand-in for
 * a presigned S3 multipart upload (see ASSUMPTIONS.md → "What is mocked,
 * and what the real thing would be"). Shared between the client
 * (`features/upload/lib/chunked-upload.ts`) and the route handlers under
 * `app/api/uploads/sessions/`, the same way `document.ts`'s schemas are
 * shared everywhere else in this app — one schema, so a change to the shape
 * is a compile error on whichever side didn't get updated, not a runtime
 * mismatch discovered in production.
 */
export const uploadSessionRequestSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string(),
  totalParts: z.number().int().positive(),
  batchId: z.string().nullable(),
});
export type UploadSessionRequest = z.infer<typeof uploadSessionRequestSchema>;

/** Part numbers are 0-indexed throughout — client, server, and storage. */
export const uploadSessionSchema = z.object({
  uploadId: z.string(),
  resumeToken: z.string(),
  totalParts: z.number().int().positive(),
  receivedParts: z.array(z.number().int().nonnegative()),
});
export type UploadSessionResponse = z.infer<typeof uploadSessionSchema>;

export const uploadPartResponseSchema = z.object({
  receivedParts: z.array(z.number().int().nonnegative()),
  isComplete: z.boolean(),
});
export type UploadPartResponse = z.infer<typeof uploadPartResponseSchema>;
