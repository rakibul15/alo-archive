import { authorizeSession } from '@/server/upload-sessions';
import { jsonError } from '@/server/http';

/**
 * "What have you got so far?" — the call that makes resuming possible.
 *
 * After a reload the client knows the `uploadId` and `resumeToken` (both
 * persisted) but not which parts actually landed before the interruption;
 * an in-flight part may or may not have completed server-side. This is the
 * authoritative answer, so the client re-sends only what's genuinely
 * missing rather than the whole file.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ uploadId: string }> },
) {
  const { uploadId } = await context.params;
  const resumeToken =
    new URL(request.url).searchParams.get('resumeToken') ?? '';

  const session = authorizeSession(uploadId, resumeToken);
  if (!session) {
    // Deliberately one status for both "no such session" and "wrong token":
    // distinguishing them would let a caller probe which upload ids exist.
    return jsonError(404, 'NOT_FOUND', 'No such upload session');
  }

  return Response.json({
    uploadId: session.uploadId,
    resumeToken: session.resumeToken,
    totalParts: session.totalParts,
    receivedParts: [...session.receivedParts].sort((a, b) => a - b),
  });
}
