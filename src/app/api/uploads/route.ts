import { env } from '@/env';
import {
  ACCEPTED_UPLOAD_MIME,
  MAX_UPLOAD_BYTES,
} from '@/lib/domain/upload-constraints';
import { archive } from '@/server/archive';
import { jsonError } from '@/server/http';

/**
 * Stands in for the ingest endpoint.
 *
 * The file is genuinely received — which is what makes the client's upload
 * progress real rather than an animation — and then genuinely discarded. Only
 * its metadata is registered, so the document can enter the processing queue.
 *
 * A share of requests fail on purpose, so the client's retry-with-backoff path
 * is exercised in ordinary use rather than only in a contrived demo.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'INVALID_BODY', 'Expected a multipart upload');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonError(400, 'INVALID_BODY', 'No file in the request');
  }

  // Rejections that a retry cannot fix are 422, so the client parks them as
  // failed instead of backing off and trying again five times.
  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(
      422,
      'FILE_TOO_LARGE',
      `${file.name} is larger than 25 MB. Split it before uploading.`,
    );
  }
  if (file.type !== '' && !ACCEPTED_UPLOAD_MIME.has(file.type)) {
    return jsonError(
      422,
      'UNSUPPORTED_FORMAT',
      `${file.type} cannot be processed. Convert to PDF or JPEG first.`,
    );
  }

  // Over localhost a 2 MB upload finishes in single-digit milliseconds, which
  // makes progress, pause and cancel impossible to see — and therefore
  // impossible to judge. This stands in for the network that is not here.
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      env.SIM_INGEST_LATENCY_MS * (0.6 + Math.random() * 0.8),
    ),
  );

  if (Math.random() < env.SIM_FAILURE_RATE / 2) {
    return jsonError(
      503,
      'UPSTREAM_UNAVAILABLE',
      'Ingest service is temporarily unavailable',
    );
  }

  const batchId = form.get('batchId');

  return Response.json(
    archive.enqueue({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type === '' ? 'application/octet-stream' : file.type,
      batchId: typeof batchId === 'string' && batchId !== '' ? batchId : null,
    }),
    { status: 201 },
  );
}
