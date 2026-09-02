import {
  EXTRACTED_FIELD_KEYS,
  LOW_CONFIDENCE_THRESHOLD,
  type DocumentType,
  type ExtractedFieldKey,
  type ExtractedFields,
  type FieldValue,
  type ProcessingErrorCode,
} from '@/lib/domain/document';
import {
  DISTRICTS,
  EXTENSION_BY_MIME,
  FAMILY_NAMES,
  FILE_PREFIXES,
  GIVEN_NAMES,
  MIME_TYPES,
  PROGRAMMES,
  UNIONS,
} from './pools';
import { chance, floatBetween, intBetween, pick, rngFor } from './random';

const DAY_MS = 86_400_000;
/** How far back the synthetic archive stretches. */
const ARCHIVE_WINDOW_DAYS = 120;

const DOCUMENT_TYPE_WEIGHTS: readonly (readonly [DocumentType, number])[] = [
  ['enrollment_form', 0.34],
  ['medical_intake', 0.24],
  ['id_scan', 0.18],
  ['handwritten_note', 0.12],
  ['consent_form', 0.09],
  ['unknown', 0.03],
];

const FAILURE_CODES: readonly ProcessingErrorCode[] = [
  'OCR_TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
  'CORRUPT_FILE',
  'UNSUPPORTED_FORMAT',
  'PASSWORD_PROTECTED',
  'PAGE_LIMIT_EXCEEDED',
];

function weightedType(roll: number): DocumentType {
  let cumulative = 0;
  for (const [type, weight] of DOCUMENT_TYPE_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return type;
  }
  return 'unknown';
}

/**
 * The stable, cheap part of a document: everything derivable from its index
 * without allocating the nested extraction objects. The archive index holds
 * only this, which is why filtering 100,000 rows stays inexpensive.
 */
export type DocumentCore = {
  index: number;
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  pageCount: number | null;
  uploadedAtMs: number;
  documentType: DocumentType;
  personName: string;
  phone: string;
  location: string;
  programName: string;
  documentDate: string;
  /** Whether extraction on this document should come out degraded. */
  degraded: boolean;
  failureCode: ProcessingErrorCode;
};

export function documentId(index: number): string {
  return `ALO-${index.toString().padStart(6, '0')}`;
}

export function deriveCore(index: number, anchorMs: number): DocumentCore {
  const rng = rngFor(index);

  const given = pick(rng, GIVEN_NAMES);
  const family = pick(rng, FAMILY_NAMES);
  const district = pick(rng, DISTRICTS);
  const union = pick(rng, UNIONS);
  const programme = pick(rng, PROGRAMMES);
  const documentType = weightedType(rng());
  const mimeType = pick(rng, MIME_TYPES);

  const ageDays = floatBetween(rng, 0, ARCHIVE_WINDOW_DAYS);
  const uploadedAtMs = Math.round(anchorMs - ageDays * DAY_MS);

  const documentDate = new Date(uploadedAtMs - intBetween(rng, 1, 400) * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const prefix = pick(rng, FILE_PREFIXES);
  const extension = EXTENSION_BY_MIME[mimeType];

  return {
    index,
    id: documentId(index),
    fileName: `${prefix}_${documentDate.replaceAll('-', '')}_${intBetween(rng, 1000, 9999)}.${extension}`,
    fileSize: intBetween(rng, 48_000, 7_400_000),
    mimeType,
    pageCount: mimeType === 'application/pdf' ? intBetween(rng, 1, 12) : 1,
    uploadedAtMs,
    documentType,
    personName: `${given} ${family}`,
    phone: `01${intBetween(rng, 3, 9)}${intBetween(rng, 10_000_000, 99_999_999)}`,
    location: `${union}, ${district}`,
    programName: programme,
    documentDate,
    // Placeholder — the store overrides this using the configured rate so the
    // knob in .env actually controls the outcome mix.
    degraded: chance(rng, 0.15),
    failureCode: pick(rng, FAILURE_CODES),
  };
}

/** Lowercased haystack for the free-text filter. Built once per row. */
export function searchTextFor(core: DocumentCore): string {
  return `${core.personName} ${core.location} ${core.programName} ${core.fileName} ${core.id}`.toLowerCase();
}

/**
 * Where each field sits on the page, as fractions of the page box.
 *
 * A fixed skeleton — these are printed forms, so the label column and the
 * answer column are in the same place on every copy — with a little
 * per-document jitter applied below, because no two scans are fed through a
 * scanner at quite the same angle or offset.
 */
const FIELD_LAYOUT: Record<
  ExtractedFieldKey,
  { x: number; y: number; width: number; height: number }
> = {
  personName: { x: 0.34, y: 0.278, width: 0.5, height: 0.042 },
  phone: { x: 0.34, y: 0.362, width: 0.36, height: 0.042 },
  location: { x: 0.34, y: 0.446, width: 0.52, height: 0.042 },
  programName: { x: 0.34, y: 0.53, width: 0.56, height: 0.042 },
  documentDate: { x: 0.34, y: 0.614, width: 0.34, height: 0.042 },
  documentType: { x: 0.34, y: 0.698, width: 0.46, height: 0.042 },
};

function boxFor(
  key: ExtractedFieldKey,
  rng: () => number,
): NonNullable<FieldValue['box']> {
  const base = FIELD_LAYOUT[key];
  const drift = (amount: number) => (rng() - 0.5) * amount;
  return {
    x: clamp01(base.x + drift(0.012)),
    y: clamp01(base.y + drift(0.008)),
    width: clamp01(base.width + drift(0.02)),
    height: base.height,
    page: 1,
  };
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

function ok(
  value: string,
  confidence: number,
  box: FieldValue['box'],
): FieldValue {
  return { value, confidence, status: 'ok', raw: null, box };
}

/** A value OCR got partly wrong: kept, flagged, and shown next to the original. */
function uncertain(
  value: string,
  confidence: number,
  raw: string,
  box: FieldValue['box'],
): FieldValue {
  return { value, confidence, status: 'low_confidence', raw, box };
}

/**
 * Nothing was found. The box is null rather than empty: there is no region of
 * the page to point the operator at, and drawing one would be a lie about where
 * the extractor looked.
 */
function missing(raw: string | null): FieldValue {
  return { value: null, confidence: 0, status: 'missing', raw, box: null };
}

/**
 * Rough visual noise, so `raw` looks like something a scanner produced.
 *
 * Digits are included deliberately: phone numbers and dates are the fields an
 * operator most needs to eyeball against the original, and a letters-only
 * substitution table left `raw` identical to `value` for exactly those fields,
 * which suppressed the "Scanned as" line where it mattered most.
 */
function smudge(value: string, rng: () => number): string {
  const substitutions: Record<string, string> = {
    o: '0',
    O: '0',
    l: '1',
    I: '1',
    S: '5',
    B: '8',
    a: '@',
    e: 'c',
    '0': 'O',
    '1': '7',
    '3': '8',
    '5': '6',
    '6': '5',
    '8': '3',
    '9': '4',
  };
  return [...value]
    .map((char) => (chance(rng, 0.18) ? (substitutions[char] ?? char) : char))
    .join('');
}

export function buildExtractedFields(
  core: DocumentCore,
  degraded: boolean,
): ExtractedFields {
  const rng = rngFor(core.index, 0x5bf03635);

  const source: Record<ExtractedFieldKey, string> = {
    personName: core.personName,
    phone: core.phone,
    location: core.location,
    programName: core.programName,
    documentDate: core.documentDate,
    documentType: core.documentType,
  };

  // A document's headline confidence is the *minimum* of six fields, and the
  // minimum of six draws sits near the bottom of whatever range they come
  // from. Ranges are therefore chosen by where the minimum should land, not by
  // where an individual field should — an earlier 0.88–0.995 per field pushed
  // essentially every clean document onto 0.89, right on the high/medium
  // boundary, and the whole table rendered amber.
  if (!degraded) {
    // Most clean scans are crisp; a fifth are legible but not sharp, which is
    // what the "medium" band exists to describe. Neither crosses the review
    // threshold, so both stay `completed`.
    const [low, high] = chance(rng, 0.22) ? [0.78, 0.9] : [0.93, 0.999];
    const fields = {} as Record<ExtractedFieldKey, FieldValue>;
    for (const key of EXTRACTED_FIELD_KEYS) {
      fields[key] = ok(
        source[key],
        floatBetween(rng, low, high),
        boxFor(key, rng),
      );
    }
    return fields;
  }

  // A degraded document: one or two fields go bad, the rest stay readable.
  const damagedCount = chance(rng, 0.45) ? 2 : 1;
  const damaged = new Set<ExtractedFieldKey>();
  while (damaged.size < damagedCount) {
    damaged.add(pick(rng, EXTRACTED_FIELD_KEYS));
  }

  const fields = {} as Record<ExtractedFieldKey, FieldValue>;
  for (const key of EXTRACTED_FIELD_KEYS) {
    const value = source[key];
    if (!damaged.has(key)) {
      // Undamaged fields stay high so the document's minimum is unambiguously
      // the damaged one — the number points at the field that needs attention.
      fields[key] = ok(value, floatBetween(rng, 0.91, 0.99), boxFor(key, rng));
      continue;
    }
    fields[key] = chance(rng, 0.35)
      ? missing(chance(rng, 0.5) ? smudge(value, rng) : null)
      : uncertain(
          value,
          floatBetween(rng, 0.32, LOW_CONFIDENCE_THRESHOLD - 0.01),
          smudge(value, rng),
          boxFor(key, rng),
        );
  }
  return fields;
}
