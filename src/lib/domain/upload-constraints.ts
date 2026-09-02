/**
 * What the ingest path will accept.
 *
 * Shared by the dropzone and the route handler on purpose. The client copy
 * exists to give instant feedback — telling someone their `.docx` is no good
 * before it spends thirty seconds uploading — and the server copy exists
 * because a client-side check is not a check. They must agree, so there is one
 * of each rather than two of them.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** In the shape react-dropzone wants: mime type to permitted extensions. */
export const ACCEPTED_UPLOAD_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/tiff': ['.tif', '.tiff'],
  'image/heic': ['.heic'],
} as const;

export const ACCEPTED_UPLOAD_MIME: ReadonlySet<string> = new Set(
  Object.keys(ACCEPTED_UPLOAD_TYPES),
);

export const ACCEPTED_EXTENSIONS_LABEL = 'PDF, JPEG, PNG, TIFF or HEIC';
