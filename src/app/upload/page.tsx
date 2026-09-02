import type { Metadata } from 'next';
import { UploadView } from '@/features/upload/components/upload-view';

export const metadata: Metadata = {
  title: 'Upload · Alo Archive',
};

export default function UploadPage() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
        <p className="text-sm text-muted-foreground">
          Drop a batch in. Files are uploaded a few at a time, retried when the
          failure is worth retrying, and handed to the processing queue as they
          arrive.
        </p>
      </header>

      <UploadView />
    </main>
  );
}
