import { env } from '@/env';
import { UPLOAD_CHUNK_BYTES } from '@/lib/domain/upload-constraints';
import {
  authorizeSession,
  isSessionComplete,
  markPartReceived,
} from '@/server/upload-sessions';
import { jsonError } from '@/server/http';

/**
 * Receives one part. The bytes are genuinely sent and genuinely discarded —
 * same trade as the single-shot ingest route: the progress bar reflects
 * bytes actually leaving the machine, the storage is the part that's mocked.
 *
 * Recording a part is idempotent (`receivedParts` is a Set), which matters
 * more here than anywhere else in this app: resuming *means* re-sending
 * parts whose fate the client couldn't observe, and a duplicate must be a
 * no-op rather than a conflict.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ uploadId: string; partNumber: string }> },
) {
  const { uploadId, partNumber: rawPartNumber } = await context.params;
  const resumeToken = request.headers.get('x-resume-token') ?? '';

  const session = authorizeSession(uploadId, resumeToken);
  if (!session) {
    return jsonError(404, 'NOT_FOUND', 'No such upload session');
  }

  const partNumber = Number(rawPartNumber);
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 0 ||
    partNumber >= session.totalParts
  ) {
    return jsonError(
      400,
      'INVALID_PART',
      `Part ${rawPartNumber} is outside 0..${session.totalParts - 1}`,
    );
  }

  const body = await request.arrayBuffer();
  // Every part but the last must be exactly one chunk; the last is whatever
  // remains. A wrong size means client and server disagree about the
  // chunking, which would otherwise surface much later as a corrupt file.
  const isLastPart = partNumber === session.totalParts - 1;
  const expectedSize = isLastPart
    ? session.fileSize - partNumber * UPLOAD_CHUNK_BYTES
    : UPLOAD_CHUNK_BYTES;
  if (body.byteLength !== expectedSize) {
    return jsonError(
      400,
      'INVALID_PART',
      `Part ${partNumber} should be ${expectedSize} bytes, got ${body.byteLength}`,
    );
  }

  // Scaled by how much of the file this part represents, so a chunked upload
  // takes roughly as long as the single-shot path would for the same bytes.
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      (env.SIM_INGEST_LATENCY_MS / session.totalParts) *
        (0.6 + Math.random() * 0.8),
    ),
  );

  if (Math.random() < env.SIM_FAILURE_RATE / 2) {
    return jsonError(
      503,
      'UPSTREAM_UNAVAILABLE',
      'Ingest service is temporarily unavailable',
    );
  }

  markPartReceived(session, partNumber);

  return Response.json({
    receivedParts: [...session.receivedParts].sort((a, b) => a - b),
    isComplete: isSessionComplete(session),
  });
}
