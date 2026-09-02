'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileWarningIcon,
  RotateCcwIcon,
} from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { describeError } from '@/lib/api/errors';
import {
  documentTypeSchema,
  ERROR_CATALOGUE,
  EXTRACTED_FIELD_KEYS,
  FIELD_LABELS,
  type DocumentRecord,
  type ExtractedFieldKey,
} from '@/lib/domain/document';
import { DOCUMENT_TYPE_LABELS } from '@/lib/domain/status-config';
import { documentDetailOptions } from '../api/queries';
import {
  useCorrectField,
  useRetryDocuments,
} from '../hooks/use-document-mutations';
import { ConfidenceIndicator } from './confidence-indicator';
import { DocumentPreview } from './document-preview';
import { FieldRow } from './field-row';
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
  orderedIds,
  onNavigate,
  onClose,
}: {
  documentId: string | null;
  /** The ids currently on screen, so review can move document to document. */
  orderedIds: readonly string[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  /**
   * Which field, if any, is being corrected right now.
   *
   * It lives up here rather than inside the field because Escape has to mean
   * two different things depending on it: cancel the edit, or close the panel.
   * Radix owns dismissal at the `SheetContent` level and registers its listener
   * outside React's tree, so `stopPropagation` on the input never reaches it —
   * the only reliable intercept is `onEscapeKeyDown` on the content itself.
   * Getting this wrong loses the operator's place in the review queue every
   * time they change their mind about an edit.
   */
  const [editingField, setEditingField] = useState<ExtractedFieldKey | null>(
    null,
  );

  return (
    <Sheet
      open={documentId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setEditingField(null);
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        // Wide enough for the page and the fields side by side. A narrow panel
        // forces the operator to scroll between the value and the thing they
        // are checking it against, which defeats the point of showing both.
        //
        // The `data-[side=right]:` prefix is load-bearing: the base component
        // sets `data-[side=right]:sm:max-w-sm`, and tailwind-merge treats a
        // differently-prefixed `sm:max-w-5xl` as a separate utility rather than
        // a conflicting one, so both survive and the narrower one wins on
        // source order. Matching the prefix is what actually overrides it.
        className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-5xl"
        onEscapeKeyDown={(event) => {
          if (editingField !== null) event.preventDefault();
        }}
      >
        {documentId === null ? null : (
          <DetailBody
            documentId={documentId}
            orderedIds={orderedIds}
            onNavigate={(id) => {
              setEditingField(null);
              onNavigate(id);
            }}
            editingField={editingField}
            onEditingChange={setEditingField}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  documentId,
  orderedIds,
  onNavigate,
  editingField,
  onEditingChange,
}: {
  documentId: string;
  orderedIds: readonly string[];
  onNavigate: (id: string) => void;
  editingField: ExtractedFieldKey | null;
  onEditingChange: (field: ExtractedFieldKey | null) => void;
}) {
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

  return (
    <DetailContent
      record={data}
      orderedIds={orderedIds}
      onNavigate={onNavigate}
      editingField={editingField}
      onEditingChange={onEditingChange}
    />
  );
}

function DetailContent({
  record,
  orderedIds,
  onNavigate,
  editingField,
  onEditingChange,
}: {
  record: DocumentRecord;
  orderedIds: readonly string[];
  onNavigate: (id: string) => void;
  editingField: ExtractedFieldKey | null;
  onEditingChange: (field: ExtractedFieldKey | null) => void;
}) {
  const retry = useRetryDocuments();
  // Hoisted here rather than instantiated once per `FieldRow`, matching how
  // `retry` is already handled — one mutation per document, not one per
  // field. Safe because only one field is ever `isEditing` at a time.
  const correct = useCorrectField();

  /**
   * The link between the page and the field list, in both directions: hovering
   * or focusing a field lights up its box, and clicking a box brings the field
   * into view. One piece of state rather than two, so they cannot disagree
   * about what is currently being looked at.
   */
  const [activeField, setActiveField] = useState<ExtractedFieldKey | null>(
    null,
  );
  const fieldRefs = useRef(new Map<ExtractedFieldKey, HTMLDivElement>());

  const registerFieldRef = useCallback(
    (key: ExtractedFieldKey, element: HTMLDivElement | null) => {
      if (element) {
        fieldRefs.current.set(key, element);
      } else {
        fieldRefs.current.delete(key);
      }
    },
    [],
  );

  const focusField = useCallback((key: ExtractedFieldKey) => {
    setActiveField(key);
    fieldRefs.current.get(key)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, []);

  const position = orderedIds.indexOf(record.id);
  const previousId = position > 0 ? orderedIds[position - 1] : undefined;
  const nextId =
    position >= 0 && position < orderedIds.length - 1
      ? orderedIds[position + 1]
      : undefined;

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

          {/*
            Working a review queue means going document to document. Sending the
            operator back to the list between each one is the difference between
            clearing 40 documents and clearing four.
          */}
          {position >= 0 && orderedIds.length > 1 ? (
            <span className="ml-auto flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={previousId === undefined}
                onClick={() => {
                  if (previousId) onNavigate(previousId);
                }}
              >
                <ChevronLeftIcon aria-hidden />
                <span className="sr-only">Previous document</span>
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {position + 1} / {orderedIds.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={nextId === undefined}
                onClick={() => {
                  if (nextId) onNavigate(nextId);
                }}
              >
                <ChevronRightIcon aria-hidden />
                <span className="sr-only">Next document</span>
              </Button>
            </span>
          ) : null}
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
                  ? `Attempt ${record.error.attempts}.`
                  : 'Retrying will fail the same way — the file itself has to change.'}
              </p>
              {record.error.retryable ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={retry.isPending}
                  onClick={() => {
                    retry.mutate({ kind: 'ids', ids: [record.id] });
                  }}
                >
                  {retry.isPending ? (
                    <Spinner />
                  ) : (
                    <RotateCcwIcon aria-hidden />
                  )}
                  Retry this document
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {record.extracted ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <DocumentPreview
              record={record}
              activeField={activeField}
              onActivate={focusField}
              // Sticky so the page stays put while the field list scrolls —
              // the comparison only works if both are on screen at once.
              className="lg:sticky lg:top-2 lg:self-start"
            />

            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">Extracted fields</h3>
                {record.status === 'needs_review' ? (
                  <p className="text-xs text-status-needs-review">
                    Correct the flagged fields to clear this document
                  </p>
                ) : null}
              </div>
              <dl className="divide-y divide-border">
                {EXTRACTED_FIELD_KEYS.map((key) => (
                  <FieldRow
                    key={key}
                    documentId={record.id}
                    fieldKey={key}
                    label={FIELD_LABELS[key]}
                    field={record.extracted?.[key]}
                    formatValue={
                      key === 'documentType' ? documentTypeLabel : undefined
                    }
                    isEditing={editingField === key}
                    onEditingChange={onEditingChange}
                    isActive={activeField === key}
                    onActiveChange={setActiveField}
                    registerRef={registerFieldRef}
                    correct={correct}
                  />
                ))}
              </dl>
            </section>
          </div>
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
 * `documentType` is extracted as a machine value; showing the raw enum to an
 * operator is a leak, not a detail.
 */
function documentTypeLabel(value: string): string {
  const parsed = documentTypeSchema.safeParse(value);
  return parsed.success ? DOCUMENT_TYPE_LABELS[parsed.data] : value;
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
