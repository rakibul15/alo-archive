'use client';

import { cn } from '@/lib/utils';
import {
  EXTRACTED_FIELD_KEYS,
  FIELD_LABELS,
  type DocumentRecord,
  type ExtractedFieldKey,
  type FieldValue,
} from '@/lib/domain/document';

/** Page geometry in SVG units. Roughly A4, so the proportions read as paper. */
const PAGE_WIDTH = 1000;
const PAGE_HEIGHT = 1414;

/**
 * The page beside the fields.
 *
 * The operator's actual job is comparing what the machine read against what is
 * on the paper. Without the paper they cannot verify anything — only accept or
 * guess — so a review panel that shows extracted values alone is asking for
 * rubber-stamping. Every serious tool in this category is a split screen for
 * exactly this reason.
 *
 * The original scans are not kept in this prototype (the ingest route receives
 * the bytes and discards them), so this renders a stand-in page from the record
 * itself. Crucially it is *not* freehand: each value is drawn inside the
 * bounding box the server reported for that field, and the highlight overlay
 * reads the same boxes. The preview and the data cannot drift apart, because
 * they are the same numbers.
 */
export function DocumentPreview({
  record,
  activeField,
  onActivate,
  className,
}: {
  record: DocumentRecord;
  activeField: ExtractedFieldKey | null;
  onActivate: (field: ExtractedFieldKey) => void;
  className?: string;
}) {
  const extracted = record.extracted;

  return (
    <figure className={cn('space-y-2', className)}>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <svg
          viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Simulated scan of ${record.fileName}`}
        >
          <PageChrome record={record} />

          {extracted
            ? EXTRACTED_FIELD_KEYS.map((key) => (
                <FieldMark
                  key={key}
                  fieldKey={key}
                  field={extracted[key]}
                  isActive={activeField === key}
                  onActivate={() => {
                    onActivate(key);
                  }}
                />
              ))
            : null}
        </svg>
      </div>

      <figcaption className="text-xs text-muted-foreground">
        Simulated scan. The original file is not stored in this prototype — the
        page is drawn from the bounding boxes the extractor reported, so the
        highlights sit where the values were read from.
      </figcaption>
    </figure>
  );
}

/** Printed matter: the parts of the form that were on the paper before anyone filled it in. */
function PageChrome({ record }: { record: DocumentRecord }) {
  return (
    <>
      <rect
        x={0}
        y={0}
        width={PAGE_WIDTH}
        height={PAGE_HEIGHT}
        className="fill-card"
      />

      <text
        x={80}
        y={130}
        className="fill-foreground"
        style={{ fontSize: 34, fontWeight: 600, letterSpacing: 2 }}
      >
        ALO RELIEF TRUST
      </text>
      <text
        x={80}
        y={178}
        className="fill-muted-foreground"
        style={{ fontSize: 24 }}
      >
        Field record · {record.id}
      </text>
      <line
        x1={80}
        y1={210}
        x2={PAGE_WIDTH - 80}
        y2={210}
        className="stroke-border"
        strokeWidth={3}
      />

      {EXTRACTED_FIELD_KEYS.map((key, index) => {
        const y = 0.278 * PAGE_HEIGHT + index * 0.084 * PAGE_HEIGHT;
        return (
          <g key={key}>
            <text
              x={80}
              y={y + 34}
              className="fill-muted-foreground"
              style={{ fontSize: 23 }}
            >
              {FIELD_LABELS[key]}
            </text>
            {/* The ruled line the value was written on. */}
            <line
              x1={330}
              y1={y + 46}
              x2={PAGE_WIDTH - 80}
              y2={y + 46}
              className="stroke-border"
              strokeWidth={2}
            />
          </g>
        );
      })}

      <text
        x={80}
        y={PAGE_HEIGHT - 90}
        className="fill-muted-foreground"
        style={{ fontSize: 20 }}
      >
        Retain for programme records
      </text>
    </>
  );
}

/**
 * One extracted value, drawn where it was found, with its box.
 *
 * Colour follows the same grammar the rest of the app uses, and the same one
 * these tools converge on: neutral for a confident read, amber for one that
 * needs checking, green once a human has confirmed it. A missing field has no
 * box at all — there is nothing on the page to point at.
 */
function FieldMark({
  fieldKey,
  field,
  isActive,
  onActivate,
}: {
  fieldKey: ExtractedFieldKey;
  field: FieldValue;
  isActive: boolean;
  onActivate: () => void;
}) {
  if (!field.box) return null;

  const x = field.box.x * PAGE_WIDTH;
  const y = field.box.y * PAGE_HEIGHT;
  const width = field.box.width * PAGE_WIDTH;
  const height = field.box.height * PAGE_HEIGHT;

  const tone =
    field.status === 'corrected'
      ? 'stroke-status-completed fill-status-completed'
      : field.status === 'low_confidence'
        ? 'stroke-status-needs-review fill-status-needs-review'
        : 'stroke-status-uploading fill-status-uploading';

  // What the scanner "saw" — the raw read where there is one, so the page and
  // the "Scanned as" line in the field list agree with each other.
  const inked = field.raw ?? field.value ?? '';

  return (
    <g
      className="cursor-pointer"
      onClick={onActivate}
      role="button"
      tabIndex={0}
      aria-label={`${FIELD_LABELS[fieldKey]} on the page`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        className={cn(tone, isActive ? 'fill-opacity-20' : 'fill-opacity-0')}
        strokeWidth={isActive ? 5 : 2.5}
        strokeDasharray={field.status === 'low_confidence' ? '10 6' : undefined}
      />
      <text
        x={x + 12}
        y={y + height * 0.72}
        className="fill-foreground"
        style={{ fontSize: 27, fontFamily: 'var(--font-mono)' }}
      >
        {inked}
      </text>
    </g>
  );
}
