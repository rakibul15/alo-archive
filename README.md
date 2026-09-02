# Alo Archive

A frontend prototype for digitising the Alo Relief Trust document archive:
upload documents in bulk, watch them move through processing, and review the
records that came out uncertain.

> All nine features in scope are built and covered by tests. `ASSUMPTIONS.md`
> records what was assumed, what was deliberately left out, and why.

## Running it

```bash
npm install
npm run dev
```

That is the whole setup. There is no `.env` file to create, no database, no
services to start. Node 20.9+ (`.nvmrc` pins 22).

```bash
npm run verify   # lint, types, colour contrast, tests, production build
```

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint, including the no-raw-colours rule |
| `npm run typecheck` | Route typegen, then `tsc --noEmit` |
| `npm run check:contrast` | Fails if any colour token drops below WCAG AA |

## Seeing it at scale

The brief is about an archive of roughly 100,000 documents, and nobody
assessing this is going to drag 100,000 files onto a dropzone. **Load 100,000
documents** on the overview page expands the corpus in place.

On the development machine the index builds in **~160 ms**, and a filtered, sorted page
request against the full 100,000 rows returns in **~30–90 ms** of server time
(the API adds 90–280 ms of deliberate latency on top so loading states are
actually reachable).

## How it is put together

```
src/
  app/
    api/            mock backend — route handlers only
    page.tsx        overview
  features/
    documents/      api/ (keys, queryOptions, mutations), components/, hooks/
  lib/
    api/            the one fetch wrapper + the typed error union
    domain/         Zod schemas; every type is inferred from them
  server/           the simulated archive: fixtures, index, simulation
```

### State lives in three places, on purpose

| Layer | Tool | Holds |
| ----- | ---- | ----- |
| Server state | TanStack Query | document list, detail, summary |
| URL state | nuqs | filters, sort, selected document |
| Client machine | Zustand | the upload queue |

Filters live in the URL so a view is shareable and survives a refresh. The
upload queue is a long-lived state machine rather than server state, so it sits
outside React Query and can be unit-tested without a component.

### The API layer is the seam

`src/lib/api/client.ts` is the only place in the app that calls `fetch`. Every
response is validated against the schema the caller expects, so a server change
surfaces as one `parse` error rather than as `undefined` three components deep.
Swapping the mock route handlers for a real backend is a change to `BASE_URL`
and nothing else.

Errors are a discriminated `ApiError` — `network` / `aborted` / `http` /
`parse` — and one predicate, `isRetryable`, decides both whether TanStack Query
retries and whether the UI offers a retry button, so the two cannot disagree.

### Scale

- The server keeps a flat index row per document holding only what filtering
  and sorting need. Full records — including the six nested extraction objects
  — are materialised only for the ~100 rows a page request actually returns.
  At 100,000 documents that is roughly 100 live objects instead of 700,000.
- Documents are derived from their integer index rather than stored, so the
  corpus is reproducible across restarts and cheap to grow.
- Pagination is **keyset**, not offset: the cursor carries the sort key of the
  last row seen. Rows changing status mid-scroll therefore cannot shift the
  window and make the virtualiser skip or repeat entries.
- The table renders about 30 rows for a 100,000-row result set. It is an ARIA
  grid rather than a `<table>` — `aria-rowcount` reports the real total and
  each row carries its true `aria-rowindex`, so a screen reader is told "row
  5,231 of 100,000" even though row 5,231 is one of thirty in the DOM.
- Below 768px the same virtualiser renders cards instead of grid rows. The
  table is never given a horizontal scrollbar; that is the lazy answer and a
  bad one to use.

### Realtime without the flood

Processing progress arrives over SSE, and the interesting decision is what is
*not* sent. Broadcasting a document object per status change is fine at 200
documents and catastrophic at 100,000. The stream carries only:

- `summary` — aggregate counts, at most once per tick
- `changed` — the **ids** that moved, batched per tick

The client patches the detail queries it already has cached and throttles list
invalidation to once every 1.5 s. Bandwidth is bounded by how many documents
are in flight, not by the size of the archive.

There is also no background timer: the simulation advances lazily whenever the
archive is read, and the SSE ticker lives and dies with the connection.

### Failures are data, not exceptions

8% of documents failing is the normal, expected state of this system. A failed
document is a row with `status: 'failed'` and a retry affordance — it never
throws, never reaches an error boundary, never shows a red screen. Error
boundaries are reserved for genuinely unexpected faults.

That gives three tiers: Next's per-route `error.tsx`, `react-error-boundary`
around individual widgets so one broken panel does not take the page with it,
and ordinary query/row state for everything the domain expects. The upload
queue sits outside all of them — no React boundary catches an async callback —
so it handles its own failures explicitly.

Failed rows carry their reason in the list, not just a red badge, and say
whether it is worth retrying. Retryability is a property of the error code
rather than a flag: `OCR_TIMEOUT` can be retried, `PASSWORD_PROTECTED` never
can, and a retry button that cannot succeed teaches people to distrust every
retry button.

### The upload queue

A pure state machine (`features/upload/lib/queue.ts`) with no React and no
`fetch` in it: the interesting behaviour is scheduling — how many uploads run
at once, when a failure deserves another attempt, how long to wait first — and
none of that should need a rendered component to test. Nineteen unit tests
cover it directly.

- **Concurrency is capped at six.** Measured, not assumed: instrumenting
  `XMLHttpRequest` across a 60-file batch tops out at exactly six in flight.
  Dropping five thousand files must not open five thousand requests.
- **Retries back off exponentially, with jitter.** The jitter matters more than
  the exponent — when an ingest service blips, every in-flight upload fails at
  the same instant, and without jitter all six retry at the same instant too,
  reproducing the load that caused the failure. A 4% server-side failure rate
  means this path runs in ordinary use: a recent 164-file batch hit three 503s
  and finished with zero user-visible failures.
- **A 4xx is not retried.** The file itself is the problem; sending the same
  bytes again just wastes four more attempts.
- **Progress is real** (see `ASSUMPTIONS.md`), weighted by bytes rather than
  file count, and cancelled files leave the denominator so a stopped batch
  reads as finished rather than stuck.
- **Nothing is refused silently.** Type and size are checked client-side as
  well as server-side, and whatever the dropzone turns away is reported with a
  per-reason breakdown and an itemised list. A batch that quietly enqueues 288
  of 300 looks like success, which is why it is the worst failure mode here.
- **Progress follows you.** The queue lives in a store, not a component, so
  uploads continue while you go and watch documents arrive in the archive — and
  a pill in the header keeps that work visible instead of making you navigate
  back to check on it.
- **A batch ends with a statement**, not a progress bar sitting at 100%: what
  was accepted, what failed, and the two things worth doing next.
- **The queue cannot survive a reload** — a `File` handle is not serialisable
  and a "resume" button would be a lie. So there is a beforeunload prompt while
  work is in flight, and a breadcrumb that turns into a banner telling the
  operator how many never made it.

### Bulk actions carry the query, not the ids

Selection is a mode plus a small exception set, so "select all 100,000, untick
three" is three strings. "Retry all failed" therefore posts the filter and the
exceptions — **113 bytes**, the same at 182 rows or 100,000 — and the server
resolves the set where it already lives. The reply is counts broken down by
error code, so the toast can say *why* 117 documents were refused.

### The review loop

Low-confidence and missing fields are flagged in place and corrected in place;
a correction is pinned to full confidence, marked `corrected`, and if it lifts
the document above the review threshold it leaves the queue on its own. The
panel steps document to document, because sending someone back to the list
between each one is the difference between clearing forty and clearing four.

Escape during an edit cancels the edit and does not close the panel — Radix
owns dismissal above React's tree, so the interception has to happen on the
sheet's `onEscapeKeyDown` rather than on the input. Focus returns to the
control that opened the editor, from an effect rather than the cancel handler,
because that button is unmounted while the editor is open.

### Colour

No component names a colour. Semantic tokens only, enforced by an ESLint rule,
with a contrast script that parses `globals.css` and fails the build below WCAG
AA in either theme. See `ASSUMPTIONS.md` for the full reasoning.

## Assumptions and trade-offs

In [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) — what was assumed, what was
deliberately left out, and why.

## What I would do with more time

- Move file enumeration and hashing off the main thread into a Web Worker.
- Persist upload intent (not the `File` handles, which cannot be persisted) so
  a refresh mid-batch can tell you exactly which files to re-select.
- Resumable uploads — presigned multipart with a resume token.
- Real virtualised column resizing and a saved-view system for filters.
- Playwright coverage for the upload → failure → retry path; it is currently
  covered at the unit level only.
- An accessibility audit with a real screen reader rather than by inspection.
