import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  LoaderIcon,
  UploadIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  type ConfidenceBand,
  type DocumentStatus,
  type DocumentType,
} from './document';

type StatusPresentation = {
  label: string;
  /** Never colour alone — WCAG 1.4.1. Every status carries a glyph too. */
  icon: LucideIcon;
  /** Semantic tokens only; see eslint.config.mjs for the rule that enforces it. */
  className: string;
  /** Whether the row should read as "still moving". */
  inFlight: boolean;
};

/**
 * `satisfies Record<DocumentStatus, …>` is the point of this file: adding a
 * status to the schema without giving it a label, an icon and a colour is a
 * compile error rather than a blank badge discovered in review.
 */
export const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: ClockIcon,
    className:
      'bg-status-pending/10 text-status-pending border-status-pending/20',
    inFlight: true,
  },
  uploading: {
    label: 'Uploading',
    icon: UploadIcon,
    className:
      'bg-status-uploading/10 text-status-uploading border-status-uploading/20',
    inFlight: true,
  },
  processing: {
    label: 'Processing',
    icon: LoaderIcon,
    className:
      'bg-status-processing/10 text-status-processing border-status-processing/20',
    inFlight: true,
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2Icon,
    className:
      'bg-status-completed/10 text-status-completed border-status-completed/20',
    inFlight: false,
  },
  needs_review: {
    label: 'Needs review',
    icon: AlertTriangleIcon,
    className:
      'bg-status-needs-review/10 text-status-needs-review border-status-needs-review/20',
    inFlight: false,
  },
  failed: {
    label: 'Failed',
    icon: XCircleIcon,
    className: 'bg-status-failed/10 text-status-failed border-status-failed/20',
    inFlight: false,
  },
} as const satisfies Record<DocumentStatus, StatusPresentation>;

export const CONFIDENCE_CONFIG = {
  high: { label: 'High', className: 'text-confidence-high' },
  medium: { label: 'Medium', className: 'text-confidence-medium' },
  low: { label: 'Low', className: 'text-confidence-low' },
  none: { label: 'Not extracted', className: 'text-confidence-none' },
} as const satisfies Record<
  ConfidenceBand,
  { label: string; className: string }
>;

export const DOCUMENT_TYPE_LABELS = {
  enrollment_form: 'Enrolment form',
  medical_intake: 'Medical intake',
  id_scan: 'ID scan',
  handwritten_note: 'Handwritten note',
  consent_form: 'Consent form',
  unknown: 'Unclassified',
} as const satisfies Record<DocumentType, string>;
