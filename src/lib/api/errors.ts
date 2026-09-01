import type { z } from 'zod';

export type ApiErrorKind =
  /** The request never reached the server. */
  | 'network'
  /** The request was cancelled — usually a superseded search. */
  | 'aborted'
  /** The server answered, but not with success. */
  | 'http'
  /** The server answered with something that is not the agreed shape. */
  | 'parse';

/**
 * A real `Error` subclass rather than a thrown object literal: stack traces,
 * `instanceof`, and sane behaviour inside React error boundaries all depend on
 * it. The `kind` discriminant is what call sites actually branch on.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly issues: readonly z.core.$ZodIssue[] | null;

  constructor(init: {
    kind: ApiErrorKind;
    message: string;
    status?: number | null;
    code?: string | null;
    issues?: readonly z.core.$ZodIssue[] | null;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.issues = init.issues ?? null;
  }
}

/**
 * Whether retrying could plausibly produce a different answer. Used both by
 * TanStack Query's `retry` and by the UI deciding whether to offer a button —
 * one definition, so the two can never disagree.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  switch (error.kind) {
    case 'network':
      return true;
    case 'http':
      // 4xx means we asked for something wrong; asking again will not help.
      return error.status !== null && error.status >= 500;
    case 'aborted':
    case 'parse':
      return false;
  }
}

/** Human-facing copy for an unexpected failure. */
export function describeError(error: unknown): {
  title: string;
  detail: string;
} {
  if (!(error instanceof ApiError)) {
    return {
      title: 'Something went wrong',
      detail: 'An unexpected error occurred. Try again.',
    };
  }

  switch (error.kind) {
    case 'network':
      return {
        title: 'Cannot reach the server',
        detail: 'Check your connection — nothing has been lost.',
      };
    case 'aborted':
      return {
        title: 'Request cancelled',
        detail: 'This request was superseded.',
      };
    case 'parse':
      return {
        title: 'Unexpected response',
        detail:
          'The server returned data in a shape this app does not understand.',
      };
    case 'http':
      return error.status === 404
        ? { title: 'Not found', detail: 'This document no longer exists.' }
        : {
            title: `Request failed (${error.status ?? 'unknown'})`,
            detail: error.message,
          };
  }
}
