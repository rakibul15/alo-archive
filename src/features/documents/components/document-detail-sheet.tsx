'use client';

import { useQuery } from '@tanstack/react-query';
import { FileWarningIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { describeError } from '@/lib/api/errors';
import {
  confidenceBand,
  documentTypeSchema,
  ERROR_CATALOGUE,
  EXTRACTED_FIELD_KEYS,
  FIELD_LABELS,
  type DocumentRecord,
  type FieldValue,
} from '@/lib/domain/document';
import {
  CONFIDENCE_CONFIG,
  DOCUMENT_TYPE_LABELS,
} from '@/lib/domain/status-config';
import { documentDetailOptions } from '../api/queries';
import { ConfidenceIndicator } from './confidence-indicator';
import { StatusBadge } from './status-badge';

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const byteFormat = new Intl.NumberFormat('en-GB', {
  style: 'unit',
  unit: 'megabyte',
  maximumFractionDigits: 1,
});

export function DocumentDetailSheet({
  documentId,
  onClose,
}: {
  documentId: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={documentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
      >
        {documentId === null ? null : <DetailBody documentId={documentId} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ documentId }: { documentId: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(
    documentDetailOptions(documentId),
  );

  if (isPending) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>
            <Skeleton className="h-5 w-56" />
          </SheetTitle>
          <SheetDescription>Loading document…</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </>
    );
  }

  if (isError) {
    const { title, detail } = describeError(error);
    return (
      <>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{detail}</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <Button
            variant="outline"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </div>
      </>
    );
  }

  return <DetailContent record={data} />;
}

function DetailContent({ record }: { record: DocumentRecord }) {
  return (
    <>
      <SheetHeader className="gap-2">
        <SheetTitle className="font-mono text-base break-all">
          {record.fileName}
        </SheetTitle>
        <SheetDescription>
          {record.id} · {DOCUMENT_TYPE_LABELS[record.documentType]}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusBadge status={record.status} />
          <ConfidenceIndicator value={record.confidence} />
        </div>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-8">
        {record.error ? (
          <Alert>
            <FileWarningIcon aria-hidden />
            <AlertTitle>{ERROR_CATALOGUE[record.error.code].title}</AlertTitle>
            <AlertDescription>
              <p>{record.error.message}</p>
              <p className="text-muted-foreground">
                {record.error.retryable
                  ? `Attempt ${record.error.attempts} — this can be retried.`
                  : 'This cannot be resolved by retrying; the file itself has to change.'}
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {record.extracted ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Extracted fields</h3>
            <dl className="divide-y divide-border">
              {EXTRACTED_FIELD_KEYS.map((key) => (
                <FieldRow
                  key={key}
                  label={FIELD_LABELS[key]}
                  field={record.extracted?.[key]}
                  formatValue={
                    key === 'documentType' ? documentTypeLabel : undefined
                  }
                />
              ))}
            </dl>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing has been extracted from this document yet.
          </p>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">File</h3>
          <dl className="text-sm">
            <MetaRow label="Size">
              {byteFormat.format(record.fileSize / 1_000_000)}
            </MetaRow>
            <MetaRow label="Type">{record.mimeType}</MetaRow>
            <MetaRow label="Pages">{record.pageCount ?? '—'}</MetaRow>
            <MetaRow label="Uploaded">
              {dateTimeFormat.format(new Date(record.uploadedAt))}
            </MetaRow>
            <MetaRow label="Processed">
              {record.processedAt
                ? dateTimeFormat.format(new Date(record.processedAt))
                : 'Not yet'}
            </MetaRow>
          </dl>
        </section>
      </div>
    </>
  );
}

/**
 * The point of this row is the `raw` line. When OCR is unsure, showing only the
 * cleaned-up guess hides the fact that there was a guess at all — the operator
 * needs to see what was actually on the page to judge it.
 */
/**
 * `documentType` is extracted as a machine value; showing the raw enum to an
 * operator is a leak, not a detail.
 */
function documentTypeLabel(value: string): string {
  const parsed = documentTypeSchema.safeParse(value);
  return parsed.success ? DOCUMENT_TYPE_LABELS[parsed.data] : value;
}

function FieldRow({
  label,
  field,
  formatValue,
}: {
  label: string;
  field: FieldValue | undefined;
  formatValue?: (value: string) => string;
}) {
  if (!field) return null;

  const band = confidenceBand(field.confidence);
  const config = CONFIDENCE_CONFIG[band];
  const uncertain =
    field.status === 'low_confidence' || field.status === 'missing';

  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-3 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="space-y-1">
        <p
          className={cn(
            'text-sm break-words',
            field.value === null && 'text-muted-foreground italic',
          )}
        >
          {field.value === null
            ? 'Missing'
            : (formatValue?.(field.value) ?? field.value)}
        </p>

        {field.raw !== null && field.raw !== field.value ? (
          <p className="font-mono text-xs text-muted-foreground">
            Scanned as: <span className="break-all">{field.raw}</span>
          </p>
        ) : null}

        {field.status === 'corrected' ? (
          <p className="text-xs text-confidence-high">Corrected by hand</p>
        ) : uncertain ? (
          <p className={cn('text-xs', config.className)}>
            {field.status === 'missing'
              ? 'Not found on the page'
              : `${config.label} confidence — needs checking`}
          </p>
        ) : null}
      </dd>
    </div>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
