import 'server-only';
import { randomUUID } from 'node:crypto';

/**
 * The server half of resumable, chunked uploads — what a real deployment
 * would model as a presigned S3 multipart upload (see ASSUMPTIONS.md →
 * "What is mocked, and what the real thing would be"). `uploadId` identifies
 * the session and is safe to log or echo back; `resumeToken` is the bearer
 * credential a client needs to write a part or complete the session, mirroring
 * how a presigned URL — not the upload id itself — is what actually
 * authorises a write against S3.
 *
 * In-memory and keyed off `globalThis`, the same pattern `archive` itself
 * uses: Next's dev server can reload this module without losing state, and
 * there's exactly one of these per server process, which is the right scope
 * for a prototype.
 */
export type UploadSession = {
  uploadId: string;
  resumeToken: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalParts: number;
  receivedParts: Set<number>;
  batchId: string | null;
  createdAt: number;
};

const globalRef = globalThis as unknown as {
  __aloUploadSessions?: Map<string, UploadSession>;
};
const sessions = (globalRef.__aloUploadSessions ??= new Map());

/**
 * Long enough to resume after a real interruption (a closed laptop lid, a
 * dropped wifi connection overnight); short enough that an abandoned upload
 * doesn't sit in memory forever on a long-running dev server. Pruned lazily,
 * on the next session created, rather than with its own timer — nothing here
 * needs to be reclaimed the instant it expires.
 */
const SESSION_TTL_MS = 60 * 60 * 1000;

function pruneExpired(now: number): void {
  for (const [uploadId, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(uploadId);
  }
}

export function createSession(input: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalParts: number;
  batchId: string | null;
}): UploadSession {
  const now = Date.now();
  pruneExpired(now);

  const session: UploadSession = {
    uploadId: randomUUID(),
    resumeToken: randomUUID(),
    receivedParts: new Set(),
    createdAt: now,
    ...input,
  };
  sessions.set(session.uploadId, session);
  return session;
}

export function getSession(uploadId: string): UploadSession | undefined {
  return sessions.get(uploadId);
}

/** `null` distinguishes "session doesn't exist" from "token doesn't match" for the caller. */
export function authorizeSession(
  uploadId: string,
  resumeToken: string,
): UploadSession | null {
  const session = sessions.get(uploadId);
  if (!session || session.resumeToken !== resumeToken) return null;
  return session;
}

export function markPartReceived(
  session: UploadSession,
  partNumber: number,
): void {
  session.receivedParts.add(partNumber);
}

export function isSessionComplete(session: UploadSession): boolean {
  return session.receivedParts.size >= session.totalParts;
}

export function deleteSession(uploadId: string): void {
  sessions.delete(uploadId);
}
