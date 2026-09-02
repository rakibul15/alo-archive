import { archive } from '@/server/archive';
import {
  authorizeSession,
  deleteSession,
  isSessionComplete,
} from '@/server/upload-sessions';
import { jsonError } from '@/server/http';

/**
 * Seals the session and registers the document — the equivalent of S3's
 * `CompleteMultipartUpload`, and the only point at which a chunked upload
 * becomes a row in the archive.
 *
 * Refuses if any part is still missing rather than registering a partial
 * file: a document that entered the queue with holes in it would fail
 * extraction later for a reason nobody could trace back to here.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ uploadId: string }> },
) {
  const { uploadId } = await context.params;
  const resumeToken = request.headers.get('x-resume-token') ?? '';

  const session = authorizeSession(uploadId, resumeToken);
  if (!session) {
    return jsonError(404, 'NOT_FOUND', 'No such upload session');
  }

  if (!isSessionComplete(session)) {
    const missing = Array.from(
      { length: session.totalParts },
      (_, index) => index,
    ).filter((index) => !session.receivedParts.has(index));
    return jsonError(
      409,
      'INCOMPLETE_UPLOAD',
      `Still missing part${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`,
    );
  }

  const summary = archive.enqueue({
    fileName: session.fileName,
    fileSize: session.fileSize,
    mimeType: session.mimeType,
    batchId: session.batchId,
  });

  // The session has served its purpose; keeping it would leave a resume
  // token that could enqueue the same document twice.
  deleteSession(uploadId);

  return Response.json(summary, { status: 201 });
}
