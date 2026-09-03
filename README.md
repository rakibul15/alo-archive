# Alo Archive

A frontend prototype for digitising the Alo Relief Trust document archive:
upload documents in bulk, watch them move through processing, and review the
records that came out uncertain.

> All nine features in scope are built and covered by tests. `ASSUMPTIONS.md`
> records what was assumed, what was deliberately left out, and why.

**Overview** — status at a glance, and the one-click path to judging
performance at the archive's real scale:

![Overview screen, showing the processing pipeline status tiles and the "Load 100,000 documents" scale control](./docs/screenshots/overview.png)

**Documents** — server-side filter/sort/search over a virtualised table;
this view is filtered to the 331 documents currently flagged for review:

![Documents table filtered to "Needs review", showing per-row status, confidence and upload date](./docs/screenshots/documents.png)

**Review panel** — the page and the extracted fields side by side, linked by
the bounding box each value was actually read from; the flagged date field
is one click from being corrected in place:

![Document detail panel with the simulated scan on the left, bounding boxes drawn per field, and the extracted fields list on the right](./docs/screenshots/detail.png)

**Upload** — drag-and-drop or a whole folder, with the accepted types and
limits stated up front rather than discovered via a rejection:

![Upload screen with an empty dropzone, stating accepted file types, the 25 MB limit and the "select a whole folder" option](./docs/screenshots/upload.png)

## Running it

```bash
npm install
npm run dev
```

That is the whole setup. There is no `.env` file to create, no database, no
services to start. Node 20.9+ (`.nvmrc` pins 22).

```bash
npm run verify   # lint, formatting, types, colour contrast, tests, production build
```

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint, including the no-raw-colours rule |
| `npm run typecheck` | Route typegen, then `tsc --noEmit` |
| `npm run check:contrast` | Fails if any colour token drops below WCAG AA |
| `npm run e2e` | Playwright, against a real production build it starts itself |

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
cover it directly, and `npm run e2e` (Playwright) covers the one thing unit
tests structurally can't: a real upload failing, automatic retries backing
off and exhausting, and a manual retry recovering it, driven through an
actual browser against a real production build — the flow this project's own
manual QA broke twice on (the queue panel collapsing to one row, then the
batch-summary card's text clipping), for the same reason both times: a real
failure state changes the page's shape in ways a run that only ever succeeds
never exercises.

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
  The folder picker is a plain file input, so react-dropzone's validation never
  runs on it — it does its own, or "select a whole folder" would be a way to
  smuggle a field team's `thumbs.db` and spreadsheets straight past the checks.
  The itemised list is capped at fifty names; the per-reason counts are tallied
  as files arrive rather than counted off that list, because a breakdown whose
  parts do not sum to its own headline is worse than no breakdown.
- **Progress follows you.** The queue lives in a store, not a component, so
  uploads continue while you go and watch documents arrive in the archive — and
  a pill in the header keeps that work visible instead of making you navigate
  back to check on it.
- **A batch ends with a statement**, not a progress bar sitting at 100%: what
  was accepted, what failed, and the two things worth doing next.
- **The queue cannot survive a reload** — a `File` handle is not serialisable,
  so there is no button that resumes a batch without the operator doing
  anything. There is a beforeunload prompt while work is in flight, and a
  breadcrumb that turns into a banner telling the operator how many never
  made it. What *has* changed since this was written: re-selecting the same
  file the banner is talking about no longer re-sends it from scratch — see
  the next section.

### Uploads are chunked and resumable

The single-shot ingest this app started with had one unavoidable failure
mode: a connection dropping at 90% of a 25 MB scan meant re-sending all
25 MB. Upload is now the one part of this prototype that matches the
production shape described in `ASSUMPTIONS.md` rather than just being
designed against it: `POST /api/uploads/sessions` opens a session (id +
resume token, the same two-part shape a presigned S3 multipart upload
hands back), `PUT .../parts/:n` takes each 4 MB chunk, `POST .../complete`
finalises it — `CreateMultipartUpload` / `UploadPart` /
`CompleteMultipartUpload`, mocked at the same seam everything else is (the
bytes are received and genuinely discarded, same as before).

The session id and resume token persist to `localStorage`, keyed by
`name:size:lastModified` rather than a content hash — hashing a 25 MB file
on the main thread to look up a resume token would cost more than
re-uploading the chunks it saves, and the server's own per-part size check
is the backstop if two different files ever collided on that key. Re-select
the same file after an interruption and it picks up from the last part the
server actually acknowledged; a different file, or the same one after the
session's one-hour TTL, just opens a fresh session — there's no incorrect
state reachable, only a missed optimisation.

The existing per-file retry-with-backoff didn't need to change to get resume
for free: a retry just calls the upload function again, and because that
function already checks for a resumable session before sending anything, an
automatic retry after a dropped part resumes it exactly the way a
reload-and-reselect does.

Verified against the real server, not simulated: a session opened and one
part uploaded via direct HTTP calls (standing in for "a real interruption
happened"), then a real browser given a `File` with the same
name/size/lastModified selected the normal way — it checked for the
existing session first, sent only the two parts that were still missing,
and completed successfully. A second run seeded a resume pointer at a
session id that didn't exist server-side (an expired-session simulation) and
confirmed the fallback: a 404 on the resume check, then a clean new session
opened and the file uploaded whole, no different from never having tried to
resume at all.

### Bulk actions carry the query, not the ids

Selection is a mode plus a small exception set, so "select all 100,000, untick
three" is three strings. "Retry all failed" therefore posts the filter and the
exceptions — **113 bytes**, the same at 182 rows or 100,000 — and the server
resolves the set where it already lives. The reply is counts broken down by
error code, so the toast can say *why* 117 documents were refused.

### Column widths are a preference, not a layout accident

Four of the five columns are drag-resizable (`Document` stays flexible —
`minmax(0, 1fr)` — and absorbs whatever the other four don't use, which is
what keeps the table from ever needing a horizontal scrollbar). Dragging
reports *incremental* deltas rather than an absolute width, so the component
doing the dragging never has to know or track the column's current size —
`useColumnWidths` owns that single source of truth, persisted to
`localStorage` the same way saved views are. `ArrowLeft`/`ArrowRight` on a
focused handle step it by a fixed amount for anyone who can't drag; `Escape`
mid-drag sends back the exact negative of everything applied so far, the
same "abandon, don't commit" convention the field-correction inputs already
use; a double-click resets just that one column, not the whole table.

Verified with a real mouse, not just a click simulator: the environment this
was built in hit a harness fault mid-session where the usual browser-pane
tool stopped delivering any input to the page at all — confirmed
independently of this feature, since even a plain nav-link click silently
failed. Two things filled the gap rather than skipping verification: a
`ColumnResizeHandle` component test (`fireEvent.pointerDown/Move/Up`,
`keyDown`) that doesn't depend on real screen coordinates at all, and a raw
CDP script driving genuine `Input.dispatchMouseEvent` calls against a
headless Chrome instance outside the broken tool — both confirmed the same
result a live drag would: `status: 144 → 194` after a 50px pull, `localStorage`
and the rendered `grid-template-columns` agreeing.

### Saved views are a name for a URL

Filters already live in the URL, so "save a view" doesn't need a database
record — it's a name next to a `DocumentFilters` object, and applying it is
the same `setFilters` call a filter click makes. What it needed instead was a
place to live: `localStorage`, not a server, since there's no account for a
server-side one to belong to (see ASSUMPTIONS.md → "One operator, no roles").
Read via `useSyncExternalStore` against a module-level snapshot rather than
mirrored into component state through `useState` + an effect — the same
pattern `useInterruptedBatch` already uses for the same reason: `localStorage`
*is* the source of truth, and copying it into React state is just a second
place for the two to disagree.

### The review loop

The panel is a split screen: a page on one side, the extracted fields on the
other. Comparing the machine's reading against the paper is the whole job, and
a panel that shows only the values is asking to be rubber-stamped.

The scans themselves are not kept, so the page is a stand-in — but it is drawn
from the bounding boxes the server reports per field, not sketched to look
plausible, so the highlights sit exactly where the values were read from and
cannot drift from the data. Hovering or focusing a field lights up its box;
clicking a box scrolls to the field. A missing field has no box at all, because
there is nothing on the page to point at.


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

### Lighthouse: 100 / 100 / 100 / 100, desktop, all three routes

The static token check can't see what a component does with a token at
runtime — it missed a zero-count status tile dimmed with `opacity-60`, which
quietly cut its text below WCAG AA by scaling the alpha of everything inside
it. A real Lighthouse run against a production build caught it in seconds;
`ASSUMPTIONS.md` has the full account, including a live-updating summary line
that occasionally wrapped to a second line and shifted the page under it (CLS
0.26 → 0.002), and why the numbers are reported for both the default
mobile-simulated preset (low-to-mid 90s on Performance, entirely a function of
simulated network latency against an internal tool's JS payload — TTFB is
~2 ms) and `--preset=desktop`, which matches this app's actual persona and
comes back **100 across the board** on `/`, `/documents` and `/upload`.

**Reproducing this — two things have to match, or the score will not:**

```bash
npm run build && npm start   # production build; `npm run dev` scores lower
                              # and is not representative — no minification,
                              # no prod optimisations, HMR overhead
```

Then audit `http://localhost:3000` (and `/documents`, `/upload`) one of two ways:

- **CLI** (simplest, always clean): `npx lighthouse http://localhost:3000 --preset=desktop`
- **Chrome DevTools:** open an **Incognito window** first, *then* the Lighthouse
  panel → Desktop → Analyze page load. A regular browser profile can pull
  extensions and cached site data into the run — Lighthouse says so itself,
  at the top of the report, when that happens ("There may be stored data
  affecting loading performance…"), and it shows up mainly as inflated CLS.
  Confirmed directly: the same build scored 100/100/100/100 from the CLI and
  from Incognito, and dropped to Performance 87 (CLS 0.26) from a normal,
  extension-carrying Chrome profile on the same machine.

## Assumptions and trade-offs

In [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) — what was assumed, what was
deliberately left out, and why. Sixteen numbered decisions in total;
the ones most likely to surprise someone testing the app rather than
reading the source:

- [Upload is capped at 25 MB / 64 bytes / five file types](./ASSUMPTIONS.md#assumption-13) —
  enforced, not cosmetic, and not `.env`-configurable like the simulated
  pipeline is.
- [Confidence reads as high/medium/low at 90% and 75%, and 75% is also the
  `needs_review` cutoff](./ASSUMPTIONS.md#assumption-14).
- ["Over 50 pages" in the failure catalogue is a label on a randomly-simulated
  error, not an enforced check](./ASSUMPTIONS.md#assumption-15) — unlike the
  upload cap above, nothing counts your file's actual pages.
- [Search debounces 300 ms; query results are treated as fresh for
  30 s](./ASSUMPTIONS.md#assumption-16) — ordinary client defaults, not
  product decisions.

## What I would do with more time

- Move file enumeration and hashing off the main thread into a Web Worker.
- Persist upload intent (not the `File` handles, which cannot be persisted) so
  a refresh mid-batch can tell you exactly *which* files to re-select — the
  interrupted-batch banner still only says how many, not their names, even
  though re-selecting the right ones now resumes them (see "Uploads are
  chunked and resumable" below).
- An accessibility audit with a real screen reader rather than by inspection.
