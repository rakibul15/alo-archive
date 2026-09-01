import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DocumentsView } from '@/features/documents/components/documents-view';
import { DocumentsViewSkeleton } from '@/features/documents/components/documents-view-skeleton';

export const metadata: Metadata = {
  title: 'Documents · Alo Archive',
};

export default function DocumentsPage() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Every document in the archive. Filtering, sorting and search all run
          on the server — the browser never holds the whole set.
        </p>
      </header>

      {/* Filters live in the URL, so the view reads useSearchParams and has to
          sit behind a Suspense boundary to keep the shell prerenderable. */}
      <Suspense fallback={<DocumentsViewSkeleton />}>
        <DocumentsView />
      </Suspense>
    </main>
  );
}
