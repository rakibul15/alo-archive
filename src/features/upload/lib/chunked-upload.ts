import { ApiError } from '@/lib/api/errors';
import {
  documentSummarySchema,
  type DocumentSummary,
} from '@/lib/domain/document';
import {
  partCountFor,
  UPLOAD_CHUNK_BYTES,
} from '@/lib/domain/upload-constraints';
import {
  uploadPartResponseSchema,
  uploadSessionSchema,
} from '@/lib/domain/upload-session';
import {
  forgetSession,
  readResumeMap,
  rememberSession,
  resumeKeyFor,
} from './resume-store';

/**
 * Resumable, chunked upload.
 *
 * The single-shot path this replaces had one unavoidable failure mode: a
 * connection dropped at 90% of a 25 MB scan meant re-sending all 25 MB. Here
 * the file goes up in parts, the session id and its resume token are
 * persisted per file, and an interrupted upload picks up from the last part
 * the server actually acknowledged.
 *
 * Still `XMLHttpRequest` rather than `fetch` for the part uploads, for the
 * same reason `upload-file.ts` was: `fetch` has no upload-progress event in
 * any shipping browser, and progress that reflects bytes actually leaving
 * the machine is the whole point. The session calls around it are plain
 * `fetch` — they carry no payload worth reporting progress for.
 */
export async function chunkedUpload(
  file: File,
  options: {
    onProgress: (fraction: number) => void;
    signal: AbortSignal;
    batchId?: string | null;
  },
): Promise<DocumentSummary> {
  const totalParts = partCountFor(file.size);
  const key = resumeKeyFor(file);

  const { uploadId, resumeToken, receivedParts } = await openOrResumeSession(
    file,
    key,
    totalParts,
    options.signal,
    options.batchId ?? null,
  );

  const done = new Set(receivedParts);
  // Resuming means the bar should start where the upload actually is, not
  // at zero — otherwise a resumed upload looks like it lost its progress.
  options.onProgress(done.size / totalParts);

  for (let partNumber = 0; partNumber < totalParts; partNumber += 1) {
    if (done.has(partNumber)) continue;

    const start = partNumber * UPLOAD_CHUNK_BYTES;
    const chunk = file.slice(
      start,
      Math.min(start + UPLOAD_CHUNK_BYTES, file.size),
    );

    const result = await putPart({
      uploadId,
      resumeToken,
      partNumber,
      chunk,
      signal: options.signal,
      onChunkProgress: (chunkFraction) => {
        // Whole completed parts, plus however far into the current one we
        // are — so the bar advances smoothly within a part, not in 1/7ths.
        options.onProgress((done.size + chunkFraction) / totalParts);
      },
    });

    done.clear();
    for (const part of result.receivedParts) done.add(part);
    options.onProgress(done.size / totalParts);
  }

  const summary = await completeSession(uploadId, resumeToken, options.signal);

  // The session is gone server-side now; leaving its token behind would mean
  // a later re-selection of the same file tries to resume something that no
  // longer exists.
  forgetSession(key);
  options.onProgress(1);
  return summary;
}

async function openOrResumeSession(
  file: File,
  key: string,
  totalParts: number,
  signal: AbortSignal,
  batchId: string | null,
): Promise<{
  uploadId: string;
  resumeToken: string;
  receivedParts: number[];
}> {
  const saved = readResumeMap()[key];

  if (saved && saved.totalParts === totalParts) {
    // A saved session might have expired server-side, or the server might
    // have restarted — either way the resume attempt 404s and we fall
    // through to opening a fresh one rather than failing the upload.
    const resumed = await fetchSession(
      saved.uploadId,
      saved.resumeToken,
      signal,
    );
    if (resumed) return resumed;
    forgetSession(key);
  }

  const response = await fetch('/api/uploads/sessions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      totalParts,
      batchId,
    }),
  }).catch((cause: unknown) => {
    throw toApiError(cause);
  });

  if (!response.ok) throw await httpError(response);

  const parsed = uploadSessionSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError({
      kind: 'parse',
      message: 'Upload session response did not match its schema',
      issues: parsed.error.issues,
    });
  }

  rememberSession(key, {
    uploadId: parsed.data.uploadId,
    resumeToken: parsed.data.resumeToken,
    totalParts: parsed.data.totalParts,
    createdAt: Date.now(),
  });

  return parsed.data;
}

async function fetchSession(
  uploadId: string,
  resumeToken: string,
  signal: AbortSignal,
): Promise<{
  uploadId: string;
  resumeToken: string;
  receivedParts: number[];
} | null> {
  let response: Response;
  try {
    response = await fetch(
      `/api/uploads/sessions/${encodeURIComponent(uploadId)}?resumeToken=${encodeURIComponent(resumeToken)}`,
      { signal },
    );
  } catch (cause) {
    throw toApiError(cause);
  }

  // Gone or unauthorised — the caller opens a fresh session instead.
  if (response.status === 404) return null;
  if (!response.ok) throw await httpError(response);

  const parsed = uploadSessionSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

function putPart(input: {
  uploadId: string;
  resumeToken: string;
  partNumber: number;
  chunk: Blob;
  signal: AbortSignal;
  onChunkProgress: (fraction: number) => void;
}): Promise<{ receivedParts: number[]; isComplete: boolean }> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      reject(new ApiError({ kind: 'aborted', message: 'Upload cancelled' }));
      return;
    }

    const xhr = new XMLHttpRequest();
    const onAbort = () => {
      xhr.abort();
    };
    input.signal.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => {
      input.signal.removeEventListener('abort', onAbort);
    };

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        input.onChunkProgress(event.loaded / event.total);
      }
    });

    xhr.addEventListener('abort', () => {
      cleanup();
      reject(new ApiError({ kind: 'aborted', message: 'Upload cancelled' }));
    });

    xhr.addEventListener('error', () => {
      cleanup();
      reject(
        new ApiError({
          kind: 'network',
          message: 'Upload could not reach the server',
        }),
      );
    });

    xhr.addEventListener('timeout', () => {
      cleanup();
      reject(new ApiError({ kind: 'network', message: 'Upload timed out' }));
    });

    xhr.addEventListener('load', () => {
      cleanup();

      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new ApiError({
            kind: 'http',
            status: xhr.status,
            message: messageFrom(payload) ?? `Upload failed with ${xhr.status}`,
          }),
        );
        return;
      }

      const parsed = uploadPartResponseSchema.safeParse(payload);
      if (!parsed.success) {
        reject(
          new ApiError({
            kind: 'parse',
            message: 'Upload part response did not match its schema',
            issues: parsed.error.issues,
          }),
        );
        return;
      }
      resolve(parsed.data);
    });

    xhr.open(
      'PUT',
      `/api/uploads/sessions/${encodeURIComponent(input.uploadId)}/parts/${input.partNumber}`,
    );
    xhr.setRequestHeader('x-resume-token', input.resumeToken);
    xhr.timeout = 60_000;
    xhr.send(input.chunk);
  });
}

async function completeSession(
  uploadId: string,
  resumeToken: string,
  signal: AbortSignal,
): Promise<DocumentSummary> {
  let response: Response;
  try {
    response = await fetch(
      `/api/uploads/sessions/${encodeURIComponent(uploadId)}/complete`,
      { method: 'POST', signal, headers: { 'x-resume-token': resumeToken } },
    );
  } catch (cause) {
    throw toApiError(cause);
  }

  if (!response.ok) throw await httpError(response);

  const parsed = documentSummarySchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError({
      kind: 'parse',
      message: 'Ingest returned an unexpected shape',
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

function toApiError(cause: unknown): ApiError {
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return new ApiError({
      kind: 'aborted',
      message: 'Upload cancelled',
      cause,
    });
  }
  return new ApiError({
    kind: 'network',
    message: 'Upload could not reach the server',
    cause,
  });
}

async function httpError(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  return new ApiError({
    kind: 'http',
    status: response.status,
    message: messageFrom(payload) ?? `Upload failed with ${response.status}`,
  });
}

function messageFrom(payload: unknown): string | null {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return null;
}
