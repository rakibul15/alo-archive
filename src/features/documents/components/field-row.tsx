'use client';

import { useEffect, useRef, useState } from 'react';
import { PencilIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  confidenceBand,
  type ExtractedFieldKey,
  type FieldValue,
} from '@/lib/domain/document';
import { CONFIDENCE_CONFIG } from '@/lib/domain/status-config';
import type { useCorrectField } from '../hooks/use-document-mutations';

type CorrectFieldMutation = ReturnType<typeof useCorrectField>;

/** The "Scanned as: …" hint, shared by the editing and display branches below. */
function ScannedAs({ raw }: { raw: string }) {
  return (
    <p className="font-mono text-xs text-muted-foreground">
      Scanned as: <span className="break-all">{raw}</span>
    </p>
  );
}

/**
 * A field, with the two things the brief asks the interface to make visible:
 * what OCR actually saw, and how sure it is. Anything flagged can be corrected
 * in place — sending someone to a separate edit screen to fix one smudged phone
 * number is how review queues stop getting worked.
 *
 * `correct` is passed in rather than called here: it's one mutation shared by
 * every field on the document (hoisted to `DetailContent`, matching how
 * `useRetryDocuments()` is already handled), not one instance per row. That's
 * safe because only one field is ever `isEditing` at a time, so only one
 * row's save/cancel controls ever read `correct.isPending`.
 */
export function FieldRow({
  documentId,
  fieldKey,
  label,
  field,
  formatValue,
  isEditing,
  onEditingChange,
  isActive,
  onActiveChange,
  registerRef,
  correct,
}: {
  documentId: string;
  fieldKey: ExtractedFieldKey;
  label: string;
  field: FieldValue | undefined;
  formatValue?: (value: string) => string;
  isEditing: boolean;
  onEditingChange: (field: ExtractedFieldKey | null) => void;
  isActive: boolean;
  onActiveChange: (field: ExtractedFieldKey | null) => void;
  registerRef: (key: ExtractedFieldKey, element: HTMLDivElement | null) => void;
  correct: CorrectFieldMutation;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Focus follows the editor in and back out again.
   *
   * The return leg has to happen here rather than in the cancel handler: the
   * trigger button is unmounted while the editor is open, so at the moment
   * cancel runs `triggerRef` still points at a detached node and focusing it
   * does nothing — leaving keyboard users dumped on the panel container.
   */
  const wasEditing = useRef(false);
  useEffect(() => {
    if (isEditing) {
      wasEditing.current = true;
      inputRef.current?.focus();
    } else if (wasEditing.current) {
      wasEditing.current = false;
      triggerRef.current?.focus();
    }
  }, [isEditing]);

  if (!field) return null;

  const band = confidenceBand(field.confidence);
  const config = CONFIDENCE_CONFIG[band];
  const uncertain =
    field.status === 'low_confidence' || field.status === 'missing';

  const startEditing = () => {
    setDraft(field.value ?? field.raw ?? '');
    onEditingChange(fieldKey);
  };

  const cancel = () => {
    onEditingChange(null);
  };

  const save = () => {
    const value = draft.trim();
    if (value === '' || value === field.value) {
      cancel();
      return;
    }
    correct.mutate(
      { id: documentId, field: fieldKey, value },
      {
        onSuccess: () => {
          onEditingChange(null);
        },
      },
    );
  };

  return (
    <div
      ref={(element) => {
        registerRef(fieldKey, element);
      }}
      // Pointer and keyboard both drive the highlight. Focus matters as much as
      // hover here: someone tabbing through the fields should see the page
      // follow them, not just someone with a mouse.
      onMouseEnter={() => {
        onActiveChange(fieldKey);
      }}
      onMouseLeave={() => {
        onActiveChange(null);
      }}
      onFocusCapture={() => {
        onActiveChange(fieldKey);
      }}
      className={cn(
        '-mx-2 grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 rounded-md px-2 py-3 transition-colors',
        isActive && 'bg-muted/60',
      )}
    >
      <dt className="pt-1 text-sm text-muted-foreground">{label}</dt>
      <dd className="space-y-1">
        {isEditing ? (
          <div className="space-y-2">
            <Input
              ref={inputRef}
              value={draft}
              disabled={correct.isPending}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                // The sheet's own `onEscapeKeyDown` stops the dismissal; this
                // just performs the cancel.
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancel();
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  save();
                }
              }}
              aria-label={`Correct ${label}`}
            />
            {field.raw !== null ? <ScannedAs raw={field.raw} /> : null}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={correct.isPending}>
                {correct.isPending ? <Spinner /> : null}
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
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
              <Button
                ref={triggerRef}
                variant={uncertain ? 'outline' : 'ghost'}
                size="sm"
                className="shrink-0"
                onClick={startEditing}
              >
                <PencilIcon aria-hidden />
                {uncertain ? 'Fix' : 'Edit'}
                <span className="sr-only"> {label}</span>
              </Button>
            </div>

            {field.raw !== null && field.raw !== field.value ? (
              <ScannedAs raw={field.raw} />
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
          </>
        )}
      </dd>
    </div>
  );
}
