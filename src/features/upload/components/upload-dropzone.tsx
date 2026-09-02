'use client';

import { useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { FolderOpenIcon, UploadCloudIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clientEnv } from '@/env.client';
import {
  ACCEPTED_EXTENSIONS_LABEL,
  ACCEPTED_UPLOAD_MIME,
  ACCEPTED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
} from '@/lib/domain/upload-constraints';
import {
  useUploadStore,
  type RejectedFile,
  type RejectionReason,
} from '../store';

/** react-dropzone's error codes, narrowed to the ones we can explain. */
function toReason(errors: readonly { code: string }[]): RejectionReason {
  if (errors.some((error) => error.code === 'file-invalid-type')) {
    return 'unsupported_type';
  }
  if (errors.some((error) => error.code === 'file-too-large')) {
    return 'too_large';
  }
  return 'other';
}

/**
 * The folder picker is a plain file input, so react-dropzone's validation never
 * runs on it. Without this, "Select a whole folder" was a way to smuggle any
 * file type past the checks the dropzone applies — and a real field folder is
 * full of thumbs.db, README.txt and stray spreadsheets.
 */
function partitionFolder(files: readonly File[]): {
  accepted: File[];
  rejected: RejectedFile[];
} {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    const reason: RejectionReason | null = !ACCEPTED_UPLOAD_MIME.has(file.type)
      ? 'unsupported_type'
      : file.size > MAX_UPLOAD_BYTES
        ? 'too_large'
        : null;

    if (reason === null) {
      accepted.push(file);
    } else {
      rejected.push({ name: file.name, size: file.size, reason });
    }
  }

  return { accepted, rejected };
}

export function UploadDropzone() {
  const addFiles = useUploadStore((state) => state.addFiles);
  const addRejections = useUploadStore((state) => state.addRejections);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // `webkitdirectory` is a non-standard attribute with no React typing, and
  // asserting one on to JSX is worse than setting it where it actually lives.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_UPLOAD_TYPES,
    // Checked here as well as on the server: rejecting a 40 MB scan after it
    // has finished uploading wastes the operator's time and their bandwidth.
    maxSize: MAX_UPLOAD_BYTES,
    // No file-count cap: the whole point is that a real batch is enormous, and
    // the queue's concurrency limit — not the dropzone — is what keeps that
    // safe.
    onDrop: (accepted, rejected) => {
      addFiles(accepted);
      // The second argument used to be dropped on the floor, which meant
      // refused files vanished without a word.
      addRejections(
        rejected.map((rejection) => ({
          name: rejection.file.name,
          size: rejection.file.size,
          reason: toReason(rejection.errors),
        })),
      );
    },
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors',
          'hover:border-primary/50 hover:bg-muted/40',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          isDragActive && 'border-primary bg-primary/5',
        )}
      >
        <input {...getInputProps()} />
        <UploadCloudIcon aria-hidden className="size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">
            {isDragActive
              ? 'Drop them here'
              : 'Drag documents here, or click to choose'}
          </p>
          <p className="text-sm text-muted-foreground">
            {ACCEPTED_EXTENSIONS_LABEL} · up to 25 MB each ·{' '}
            {clientEnv.NEXT_PUBLIC_MAX_PARALLEL_UPLOADS} upload at a time
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const { accepted, rejected } = partitionFolder([
              ...(event.target.files ?? []),
            ]);
            addFiles(accepted);
            addRejections(rejected);
            // Reset, or picking the same folder twice does nothing.
            event.target.value = '';
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => folderInputRef.current?.click()}
        >
          <FolderOpenIcon aria-hidden />
          Select a whole folder
        </Button>
        <p className="text-xs text-muted-foreground">
          Field teams send folders, not files.
        </p>
      </div>
    </div>
  );
}
