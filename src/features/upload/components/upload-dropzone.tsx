'use client';

import { useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { FolderOpenIcon, UploadCloudIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clientEnv } from '@/env.client';
import { useUploadStore } from '../store';

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/tiff': ['.tif', '.tiff'],
  'image/heic': ['.heic'],
};

export function UploadDropzone() {
  const addFiles = useUploadStore((state) => state.addFiles);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // `webkitdirectory` is a non-standard attribute with no React typing, and
  // asserting one on to JSX is worse than setting it where it actually lives.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    // No file-count cap: the whole point is that a real batch is enormous, and
    // the queue's concurrency limit — not the dropzone — is what keeps that
    // safe. Validation happens per file as each one is uploaded.
    onDrop: (accepted) => {
      addFiles(accepted);
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
            PDF, JPEG, PNG, TIFF or HEIC · up to 25 MB each ·{' '}
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
            addFiles([...(event.target.files ?? [])]);
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
