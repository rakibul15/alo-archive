import { env } from '@/env';
import {
  ACCEPTED_UPLOAD_MIME,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  normalizeUploadFileName,
  partCountFor,
} from '@/lib/domain/upload-constraints';
import { uploadSessionRequestSchema } from '@/lib/domain/upload-session';
import { createSession } from '@/server/upload-sessions';
import { jsonError } from '@/server/http';

/**
 * Opens a resumable upload session — the stand-in for initiating an S3
 * multipart upload and handing back presigned part URLs.
 *
 * Every constraint the single-shot `/api/uploads` route enforces is enforced
 * here too, and for the same reason: this is a second entry point to the same
 * ingest path, and a check that only one of them applies is not a check.
 * Doing it at session-open rather than at the first part means a 30 MB file
 * is refused before a single byte of it is sent.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'INVALID_BODY', 'Expected a JSON body');
  }

  const parsed = uploadSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      400,
      'INVALID_BODY',
      'Expected fileName, fileSize, mimeType, totalParts and batchId',
    );
  }
  const input = parsed.data;

  if (input.fileSize > MAX_UPLOAD_BYTES) {
    return jsonError(
      422,
      'FILE_TOO_LARGE',
      `${input.fileName} is larger than 25 MB. Split it before uploading.`,
    );
  }
  if (input.fileSize < MIN_UPLOAD_BYTES) {
    return jsonError(422, 'FILE_TOO_SMALL', `${input.fileName} is empty.`);
  }
  if (input.mimeType !== '' && !ACCEPTED_UPLOAD_MIME.has(input.mimeType)) {
    return jsonError(
      422,
      'UNSUPPORTED_FORMAT',
      `${input.mimeType} cannot be processed. Convert to PDF or JPEG first.`,
    );
  }
  // The client tells us how many parts it intends to send, but the file size
  // is what actually determines it — a mismatch means the two disagree about
  // the chunk size, and trusting the client's number would leave a session
  // that can never complete.
  const expectedParts = partCountFor(input.fileSize);
  if (input.totalParts !== expectedParts) {
    return jsonError(
      400,
      'INVALID_BODY',
      `Expected ${expectedParts} parts for a ${input.fileSize}-byte file, got ${input.totalParts}`,
    );
  }

  await new Promise((resolve) =>
    setTimeout(resolve, env.SIM_INGEST_LATENCY_MS * 0.2),
  );

  const session = createSession({
    fileName: normalizeUploadFileName(input.fileName),
    fileSize: input.fileSize,
    mimeType:
      input.mimeType === '' ? 'application/octet-stream' : input.mimeType,
    totalParts: expectedParts,
    batchId: input.batchId,
  });

  return Response.json(
    {
      uploadId: session.uploadId,
      resumeToken: session.resumeToken,
      totalParts: session.totalParts,
      receivedParts: [...session.receivedParts],
    },
    { status: 201 },
  );
}
