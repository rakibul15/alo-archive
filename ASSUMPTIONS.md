# Assumptions and scope

The brief is deliberately under-specified, so this file records the decisions
taken in place of the missing specification. Anything here is a choice, not a
requirement — each one could reasonably have gone the other way.

## Who this is for

One person: an **operations coordinator at Alo Relief Trust**. Not a developer,
not a data-entry clerk. Their day is: get a batch from a field team into the
system, see what is stuck, and fix the records the machine was not sure about.

Everything is designed for that one role. There is no login, no permission
model, no admin view. A multi-user version would need all three, and would
change the review workflow substantially — a correction would need an author
and an audit trail.

## The three flows

```
INGEST  →  MONITOR  →  RESOLVE
upload      what state      what is broken
            is it in        or uncertain
```

Every feature belongs to one of these. Anything that did not was cut.

## Scope

**In scope** (status as of the current commit)

| #  | Feature | State |
| -- | ------- | ----- |
| M1 | Bulk and single upload, drag-and-drop, folder drop | not started |
| M2 | Upload queue with bounded concurrency, per-file and aggregate progress, pause/cancel | not started |
| M3 | Processing progress over SSE — pending → processing → terminal | stream + client subscription done |
| M4 | Virtualised document table, server-side filter/sort/search | done |
| M5 | Status summary, click-through to a filtered view | done |
| M6 | Detail panel with per-field confidence, addressable by URL | done |
| M7 | Failure handling — error taxonomy, single and bulk retry, backoff | done |
| M8 | Review flow — low-confidence fields flagged, corrected inline | done |
| M9 | Scale mode — expand the archive to 100,000 documents on demand | done |

**Deliberately not built**: authentication, a database, real OCR, multi-tenancy,
i18n, file preview rendering, notifications, audit log, export.

These are absent because the brief asks for a frontend prototype and the time
was better spent on the parts it says it cares about. Listing them is the point:
knowing what was skipped is different from forgetting it.

## Assumptions

1. **One operator, no roles.** No authentication, no permissions, no per-user
   state.
2. **Upload and extraction are simulated.** Latency 400–2600 ms per document,
   ~8% of documents fail, ~15% come out degraded. All configurable — see
   `.env.example`.
3. **One document produces one record.** Multi-page PDFs are not split into
   several records.
4. **Confidence is per field, not per document.** A scanned intake sheet can
   have a legible name next to a smudged phone number, and one number per
   document throws away the only information that says *where* to look.
5. **A document's headline confidence is its weakest field, not the mean.** An
   average lets five good fields hide one unreadable one. The consequence,
   accepted knowingly: a document with one missing field reads as 0% confident
   even if everything else was extracted perfectly.
6. **`needs_review` is a status, not a flavour of `completed`.** "Done" and
   "done, but check it" are different jobs for the operator, so they are
   different states.
7. **Filtering, sorting and search happen on the server.** The client never
   holds the full archive. Pagination is keyset, not offset, so rows changing
   status mid-scroll cannot shift the window.
8. **Retryability is a property of the error code.** `OCR_TIMEOUT` is
   retryable; `PASSWORD_PROTECTED` is not. A retry button that cannot succeed
   teaches people to distrust every retry button.
9. **A human correction always wins** over the extracted value, is pinned to
   full confidence, and is marked `corrected` rather than overwriting silently.
10. **The upload queue is session-scoped.** `File` handles cannot be persisted,
    so a refresh mid-upload loses the queue. This is surfaced — a warning before
    unload and a banner afterwards — rather than hidden.
11. **State is in memory and single-instance.** Restarting the server resets
    the archive. It would not survive a multi-instance deployment; that is the
    correct trade for a prototype and the wrong one for production.
12. **Modern evergreen browsers only.** No polyfills, no IE-era fallbacks.

## Design tokens

No component is allowed to name a colour. Three layers:

```
primitive   oklch literals              live only in globals.css
semantic    --background, --destructive  shadcn's set
domain      --status-failed, --confidence-low   ours
```

Components reference the domain and semantic layers only. This is enforced,
not merely intended:

- `eslint.config.mjs` rejects raw palette classes (`bg-red-500`) and literal
  colour values (`text-[#f00]`). Token-derived `color-mix()` is allowed,
  because it is still made of tokens.
- `scripts/check-contrast.mjs` parses `globals.css`, resolves the `var()`
  aliases and fails the build if any status or confidence token drops below
  WCAG AA (4.5:1) against its own theme background. It reads the stylesheet
  rather than duplicating the values, so it cannot drift.

Status is never communicated by colour alone — every status carries an icon and
a text label (WCAG 1.4.1).

## TypeScript

- `strict` plus `noUncheckedIndexedAccess`. The second one matters here:
  indexing into a virtualised 100,000-row window genuinely can return
  `undefined`, and the compiler should say so.
- `exactOptionalPropertyTypes` is **off**. It fights react-hook-form and
  several Radix prop types, and the cost outweighed the benefit at this size.
- **Schema-first.** Every domain type is `z.infer`red from a Zod schema. The
  data model was always going to move, and this way one edit propagates to the
  types, the API validation and the fixture generator together.
- No `any`, no `as` casts at boundaries — `unknown` plus a parse instead.
- Branded id types were tried and removed: with fixtures and route params they
  cost a cast at every construction site and paid back nothing at this scale.

## Bulk actions send a query, not an id list

Selection is a mode plus a small exception set — `include` (nothing but these)
or `exclude` (everything matching the filter but these) — rather than an array
of selected ids.

The array version breaks the moment somebody ticks "select all" against 100,000
matching rows: building it means fetching every id, holding 100,000 strings, and
posting them back on the next action. And "select all, then untick three" is the
case it handles worst.

So "retry all 182 failed" posts `{ filter, except: [] }` — 113 bytes, and the
same 113 bytes at 100,000 rows. The set is resolved on the server, where it
already lives. `POST /api/documents/retry` accepts either shape.

The response is counts, not ids, broken down by error code, so the UI can say
"65 re-queued · 117 cannot be retried (27 unsupported file type, 34 file is
unreadable, 26 password protected, 30 too many pages)" instead of shrugging.

## No headless table library

`@tanstack/react-table` was installed and then removed. The column set is
fixed, and sorting, filtering and paging all happen on the server, so the
library would have contributed a layer of state without removing one. What the
list actually needed was virtualisation, which is a different package.

The rows are therefore a CSS grid with explicit ARIA (`role="grid"`,
`aria-rowcount`, `aria-rowindex`) rather than a `<table>`. Absolutely
positioned rows inside a `<tbody>` are unreliable across browsers, and the ARIA
grid pattern is the one that can honestly say "row 5,231 of 100,000" when only
thirty rows exist in the DOM.

## Environment variables

Every variable is optional and the app runs with no `.env` file. Unknown
variables are ignored (a Zod object strips keys it does not know), and invalid
values log a warning and fall back to the default instead of throwing.

That is the opposite of what a production service should do — it should fail
fast on boot. The trade is inverted on purpose: this is a prototype somebody
else has to be able to run on the first attempt, and dropping an existing
`.env` into the directory must not break it.

## What is mocked, and what the real thing would be

The mock lives entirely behind `src/lib/api/client.ts`. No component imports
anything below it, so swapping it for a real service is a change to one file.

A production version would be: presigned S3 multipart upload straight from the
browser, an ingest queue feeding an OCR worker pool, Postgres holding
`document` and `extracted_field` rows, and workers pushing status back over a
websocket or webhook. The frontend contract here was designed against that
shape — cursor pagination, id-only change events, per-field confidence — so the
swap does not require reshaping the UI.
