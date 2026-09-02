import { ApiError } from '@/lib/api/errors';
import {
  documentSummarySchema,
  type DocumentSummary,
} from '@/lib/domain/document';

/**
 * Uploads one file, reporting real progress.
 *
 * This is the one place in the app that reaches for `XMLHttpRequest` instead of
 * `fetch`. It is not nostalgia: `fetch` still has no upload progress event in
 * any shipping browser, and `xhr.upload.onprogress` is the only way to draw a
 * progress bar that reflects bytes actually leaving the machine rather than an
 * animation timed to look plausible.
 *
 * The bytes are genuinely sent and genuinely discarded server-side — the
 * progress is real, the storage is not.
 */
export function uploadFile(
  file: File,
  options: {
    onProgress: (fraction: number) => void;
    signal: AbortSignal;
  },
): Promise<DocumentSummary> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(new ApiError({ kind: 'aborted', message: 'Upload cancelled' }));
      return;
    }

    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append('file', file, file.name);

    const onAbort = () => {
      xhr.abort();
    };
    options.signal.addEventListener('abort', onAbort, { once: true });

    const cleanup = () => {
      options.signal.removeEventListener('abort', onAbort);
    };

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress(event.loaded / event.total);
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
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'error' in payload &&
          typeof payload.error === 'object' &&
          payload.error !== null &&
          'message' in payload.error &&
          typeof payload.error.message === 'string'
            ? payload.error.message
            : `Upload failed with ${xhr.status}`;

        reject(new ApiError({ kind: 'http', status: xhr.status, message }));
        return;
      }

      const parsed = documentSummarySchema.safeParse(payload);
      if (!parsed.success) {
        reject(
          new ApiError({
            kind: 'parse',
            message: 'Ingest returned an unexpected shape',
            issues: parsed.error.issues,
          }),
        );
        return;
      }

      options.onProgress(1);
      resolve(parsed.data);
    });

    xhr.open('POST', '/api/uploads');
    xhr.timeout = 60_000;
    xhr.send(body);
  });
}
