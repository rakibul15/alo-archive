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
| M1 | Bulk and single upload, drag-and-drop, folder drop | done |
| M2 | Upload queue with bounded concurrency, per-file and aggregate progress, pause/cancel | done |
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
10. **The queue itself is session-scoped; the upload progress underneath it is
    not.** `File` handles genuinely cannot be persisted — that's a browser
    limit, not a choice — so a refresh mid-upload still means re-selecting
    every file, surfaced honestly (a warning before unload, a banner
    afterwards) rather than hidden. Uploads are, however, chunked and
    resumable (`features/upload/lib/chunked-upload.ts`): the session id and
    resume token for each in-flight file persist to `localStorage`, keyed by
    name+size+lastModified, so re-selecting the *same* file resumes from the
    last part the server actually received instead of re-sending from byte
    zero. A different file, or the same one after the one-hour session TTL,
    just opens a fresh session — no incorrect state is reachable, only a
    missed optimisation.
11. **State is in memory and single-instance.** Restarting the server resets
    the archive. It would not survive a multi-instance deployment; that is the
    correct trade for a prototype and the wrong one for production.
12. **Modern evergreen browsers only.** No polyfills, no IE-era fallbacks.
13. <a id="assumption-13"></a>**Uploads are capped at 25 MB and 64 bytes, and
    to five file types** (PDF, JPEG, PNG, TIFF, HEIC — see
    `upload-constraints.ts`). No brief mandate behind these numbers; they
    stand in for "a single scanned form or ID photo," sized above a real one
    and well below anything that would need chunking for browser performance
    reasons. Enforced identically client-side (instant feedback) and
    server-side (a client check is not a check). Unlike assumption 2's
    simulated-pipeline numbers, these are **not** in `.env.example` — a fixed
    product decision, not a demo knob.
14. <a id="assumption-14"></a>**Confidence bands are 90% / 75%, and 75%
    doubles as the review threshold.** `confidenceBand()` reads ≥90% as
    "high", 75–89% as "medium", below that as "low"; the same 75% line
    (`REVIEW_THRESHOLD`) decides routing to `needs_review`. No brief mandate
    behind either number — they stand in for "obviously fine" versus "worth a
    second look." Reusing one number for both is deliberate: a "medium"
    reading is, by construction, exactly the case the review queue exists for.
15. <a id="assumption-15"></a>**"Documents over 50 pages must be split before
    upload" is flavour text, not an enforced limit.** `PAGE_LIMIT_EXCEEDED`
    is one of six error codes the simulation assigns at random to model
    realistic failure variety (assumption 2) — nothing counts an uploaded
    file's actual pages, and the fixture generator itself caps simulated PDFs
    at 1–12 pages. Worth being explicit about since it reads like a real,
    client-enforced constraint the way assumption 13's 25 MB limit actually
    is, and it is not one.
16. <a id="assumption-16"></a>**Two minor client defaults, not tuned against a
    measurement the way the upload concurrency cap was:** the search box
    debounces input 300 ms (`documents-filters.tsx`), and TanStack Query
    treats a response as fresh for 30 s (`providers.tsx`). Ordinary perf
    defaults, listed here only so nothing in the app is a number nobody can
    account for.

## Design tokens

No component is allowed to name a colour. Three layers:

```
primitive   oklch literals              live only in globals.css
semantic    --background, --destructive  shadcn's set
domain      --status-failed, --confidence-low   ours
```

Components reference the domain and semantic layers only. Enforced, not
merely intended: `eslint.config.mjs` rejects raw palette classes and literal
colour values, and `scripts/check-contrast.mjs` parses `globals.css`,
resolves `var()` aliases and fails the build if any status or confidence
token drops below WCAG AA (4.5:1) against its own theme background — it reads
the stylesheet rather than duplicating values, so it cannot drift.

Status is never communicated by colour alone — every status carries an icon
and a text label (WCAG 1.4.1).

**What the static check cannot see:** it verifies each token in isolation
against a flat background, but not what a component does with it afterwards.
A zero-count status tile dimmed with `opacity-60` still passed the check in
isolation, yet rendered at 3.52:1 against the required 4.5:1 once a real
browser composited the opacity on top of it — caught by a Lighthouse
accessibility run against a production build, not by the script. Fixed by
removing the opacity (the "0" already reads as de-emphasised on its own).
The same pass caught a genuine layout shift (CLS 0.26 → 0.002): a
live-updating summary line occasionally wrapped to a second line and pushed
the page under it; fixed with `truncate`, since a live string should never be
allowed to change its container's height.

**Lighthouse mobile vs desktop.** The CLI's default preset simulates a
throttled mobile connection and holds every route to the low-to-mid 90s on
Performance purely from simulated network latency (TTFB is ~2 ms; the rest is
the preset, not real slowness). This app's actual persona works from a
desktop browser on an ordinary connection, which `--preset=desktop` models —
audited both ways rather than reporting only the flattering one. Desktop is
**100/100/100/100 on Performance, Accessibility, Best Practices and SEO, on
`/`, `/documents` and `/upload`**, confirmed over multiple runs.

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

## Upload progress is real; the storage is not

The upload path is the one request that does not go through the shared
`fetch` client — `fetch` still cannot report upload progress in any shipping
browser, so ingest uses `XMLHttpRequest` for `upload.onprogress`. The bytes
are genuinely sent and genuinely discarded server-side, so the progress bar
reflects real bytes leaving the machine, not an animation timed to look
plausible. The ingest route carries a deliberate delay
(`SIM_INGEST_LATENCY_MS`, 700 ms by default) — over localhost a 2 MB upload
would otherwise complete too fast to see progress, pause or cancel at all.

Refused files are reported, never dropped: type and size are checked
client-side (instant feedback, no wasted upload) as well as server-side, and
anything refused is surfaced with a per-reason breakdown and an itemised list
(capped at 50 entries; the breakdown itself is tallied as files arrive rather
than derived from the capped list, so it can't disagree with its own total).
The "select a folder" path runs the same checks, since a plain file input
bypasses the dropzone's validation entirely.

Two smaller decisions: aggregate progress is weighted by **bytes**, not file
count (a 1 MB file finishing out of a 1 MB + 9 MB pair is 10% done, not 50%);
and cancelled files leave the denominator, so a batch the operator
deliberately stopped reads as finished rather than stuck.

## The page is shown next to the fields

The operator's actual job is comparing what the machine read against what is
on the paper — without it they can only accept or guess, so a panel showing
extracted values alone invites rubber-stamping.

Scans aren't kept, so the panel renders a stand-in page, but it is **not
drawn freehand**: each value sits inside the bounding box the server reported
for that field, and the highlight overlay reads the same boxes, so the
preview and the data cannot drift apart. `box` lives on `FieldValue` in the
schema, normalised to 0–1 the way real extraction services return it (Google
Document AI, Rossum) — working the geometry out in the browser would model it
backwards, since where a value sits on the page is something the extractor
knows and the client cannot. A missing field has no box at all rather than an
empty one, since there is nothing on the page to point at.

## Bulk actions send a query, not an id list

Selection is a mode plus a small exception set — `include` (nothing but
these) or `exclude` (everything matching the filter but these) — rather than
an array of selected ids, which breaks the moment somebody ticks "select all"
against 100,000 rows: building it means fetching every id and holding 100,000
strings, and "select all, then untick three" is the case it handles worst.

"Retry all 182 failed" posts `{ filter, except: [] }` — 113 bytes, the same
at 100,000 rows — and the set is resolved on the server, where it already
lives. `POST /api/documents/retry` accepts either shape, and the response is
counts by error code, so the UI can say *why* 117 documents were refused.

## No headless table library

`@tanstack/react-table` was installed and then removed. The column set is
fixed, and sorting, filtering and paging all happen on the server, so the
library would have added a layer of state without removing one — what the
list actually needed was virtualisation, a different package.

The rows are a CSS grid with explicit ARIA (`role="grid"`, `aria-rowcount`,
`aria-rowindex`) rather than a `<table>`: absolutely positioned rows inside a
`<tbody>` are unreliable across browsers, and the ARIA grid pattern is the
one that can honestly say "row 5,231 of 100,000" when only thirty rows exist
in the DOM.

## Environment variables

Every variable is optional and the app runs with no `.env` file. Unknown
variables are ignored (a Zod object strips keys it does not know), and
invalid values log a warning and fall back to the default instead of
throwing — the opposite of what a production service should do (fail fast on
boot), inverted on purpose since this is a prototype somebody else has to be
able to run on the first attempt.

## A keyboard-and-accessibility-tree audit, beyond Lighthouse

Lighthouse's accessibility score is automated `axe-core` rules — real, but
documented by axe's own maintainers to catch a minority of real-world WCAG
issues. The categories it can't check are exactly the ones that matter most
to an assistive-technology user: correct tab order, sensible focus on open
and close, live-region announcements for dynamic updates.

This machine has no screen reader set up to drive (VoiceOver needs
Accessibility permissions this environment doesn't have; no NVDA/JAWS
install), so nothing here claims to have listened to real assistive-tech
output. What was checked instead, across all three routes: the same
accessibility tree a screen reader consumes via the browser's own
accessibility API, and real keyboard events rather than simulated clicks.

- **Tab order** — verified against raw DOM order (with zero elements
  carrying a positive `tabindex`, DOM order *is* tab order): correct on all
  three routes, including the one hand-rolled focus-management path in the
  app (`FieldRow`'s Escape-cancels-without-closing-the-sheet behaviour),
  confirmed against `document.activeElement` rather than just read from the
  source.
- **Sheet focus-trap on open**, including the harder case of deep-linking
  straight to a document (`?doc=...`) with no click to have set focus first —
  lands inside the sheet, not left behind on the page underneath.
- **Live regions** — the table footer's row count and the upload queue's
  progress summary both carry `aria-live="polite"`, confirmed present in the
  rendered DOM.

Nothing here needed fixing.

## What is mocked, and what the real thing would be

The mock lives entirely behind `src/lib/api/client.ts`. No component imports
anything below it, so swapping it for a real service is a change to one file.

A production version would be: presigned S3 multipart upload straight from
the browser, an ingest queue feeding an OCR worker pool, Postgres holding
`document` and `extracted_field` rows, and workers pushing status back over a
websocket or webhook. The frontend contract here — cursor pagination,
id-only change events, per-field confidence — was designed against that
shape, so the swap does not require reshaping the UI.

Upload is the one piece of that shape actually built, not just designed
against: `POST /api/uploads/sessions` → `PUT .../parts/:n` → `POST
.../complete` is the same three-step shape S3's own multipart API uses
(`CreateMultipartUpload` / `UploadPart` / `CompleteMultipartUpload`). What
stays mocked is *where* the bytes go — today's routes receive and discard
them; a real swap points the client at presigned S3 URLs and lets S3 do the
reassembly, a change to `chunked-upload.ts`'s three fetch calls, not to the
resumability model itself.
