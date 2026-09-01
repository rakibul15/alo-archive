# Alo Archive

A frontend prototype for digitising the Alo Relief Trust document archive:
upload documents in bulk, watch them move through processing, and review the
records that came out uncertain.

> **Status: in progress.** The domain model, the mock backend and the API layer
> are complete and covered by tests; the upload, table, detail and review
> screens are being built on top of them. `ASSUMPTIONS.md` tracks what is done.

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
