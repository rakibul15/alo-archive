import { StatusSummary } from '@/features/documents/components/status-summary';
import { ScaleControl } from '@/features/documents/components/scale-control';

export default function OverviewPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Alo Archive</h1>
        <p className="text-sm text-muted-foreground">
          Ingest, processing status and extracted records for the Alo Relief
          Trust document archive.
        </p>
      </header>

      <StatusSummary />
      <ScaleControl />
    </main>
  );
}
