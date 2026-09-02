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
10. **The upload queue is session-scoped.** `File` handles cannot be persisted,
    so a refresh mid-upload loses the queue. This is surfaced — a warning before
    unload and a banner afterwards — rather than hidden.
11. **State is in memory and single-instance.** Restarting the server resets
    the archive. It would not survive a multi-instance deployment; that is the
    correct trade for a prototype and the wrong one for production.
12. **Modern evergreen browsers only.** No polyfills, no IE-era fallbacks.
13. **Uploads are capped at 25 MB and 64 bytes, and to five file types** (PDF,
    JPEG, PNG, TIFF, HEIC — see `upload-constraints.ts`). No brief mandate
    behind these numbers; they are a stand-in for "a single scanned form or ID
    photo," sized well above a real one (a multi-page scanned PDF is typically
    a few MB) and well below anything that would make an in-browser upload
    slow enough to need chunking, which is out of scope here. The 64-byte
    floor exists only to reject empty/near-empty garbage, not legitimately
    tiny images. Both bounds are enforced identically client-side (instant
    feedback, and the dropzone helper text states them) and server-side (a
    client check is not a check). Unlike the simulated-pipeline numbers in
    assumption 2, these are **not** exposed through `.env.example` — they are
    a fixed product decision, not a tuning knob for demoing the pipeline.
14. **Confidence bands are 90% / 75%, and 75% doubles as the review
    threshold.** `confidenceBand()` reads ≥90% as "high", 75–89% as "medium",
    below that as "low"; the same 75% line (`REVIEW_THRESHOLD`) decides
    whether a document is routed to `needs_review`. No brief mandate behind
    either number — they stand in for "obviously fine" versus "worth a second
    look," set so the review queue catches genuinely marginal extractions
    without flooding the operator with anything short of a near-perfect read.
    Reusing one number for both the band boundary and the routing threshold is
    deliberate: a field reading "medium" confidence is, by construction,
    exactly the case the review queue exists for.
15. **"Documents over 50 pages must be split before upload" is flavour text,
    not an enforced limit.** `PAGE_LIMIT_EXCEEDED` is one of six error codes
    the simulation assigns at random to model realistic failure variety (see
    assumption 2) — nothing here counts an uploaded file's actual pages and
    rejects it above 50; the fixture generator itself caps simulated PDFs at
    1–12 pages, well under the number in the message. Worth being explicit
    about, since it reads like a real, client-enforced constraint the way
    assumption 13's 25 MB limit actually is, and it is not one.
16. **Two minor client defaults, neither tuned against a measurement the way
    the upload concurrency cap in the README was:** the search box debounces
    input 300 ms before it reaches the URL/query (`documents-filters.tsx`),
    and TanStack Query treats a response as fresh for 30 s (`providers.tsx`)
    before refetching on its own. Ordinary perf defaults, picked once rather
    than product decisions, listed here only so nothing in the app is a
    number nobody can account for.

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

## What the token check cannot see, and what caught it instead

`check-contrast.mjs` verifies every domain token against a flat theme
background and gates the build on it. It cannot see what happens once a
component wraps that token in something else — and one did. A zero-count
status tile (e.g. "Uploading — 0") was dimmed with `opacity-60` to read as
de-emphasised. CSS `opacity` scales down the alpha of everything in the
subtree, text included, against whatever sits behind it — so a token that
passes 8.9:1 in isolation can still render unreadable once a parent opacity is
applied on top. The script has no way to model that, because it never renders
anything; it only resolves CSS variables.

A real Lighthouse accessibility audit (`npx lighthouse … --preset=desktop`,
run against a production build) caught it in ten seconds, walking actual
ancestor opacity the way a browser does: **3.52:1 against a 4.5:1
requirement**, on `#496e9d` text over a `#101419` composited background. Fixed
by removing the opacity — the number "0" already reads as de-emphasised on its
own, so it did not need a second, contrast-breaking signal stacked on top of
it. Re-audited clean afterwards, three runs, no variance.

The same audit pass found a genuine layout shift (CLS 0.26 on the overview
page): the pipeline summary line ("2,400 documents in the archive · 12.3/s
completing") grows a live throughput suffix as the SSE stream reports it, and
on a narrow viewport that was sometimes enough extra text to wrap onto a
second line mid-session, pushing the whole status grid down half a line.
Fixed with `truncate` on that one element — a live-updating string can never
be allowed to change the height of its container. CLS afterwards: 0.002,
attributable to that same element's benign horizontal growth from empty to
full text, not a vertical shift at all.

Two things this pass also ruled out, worth recording so they are not
re-litigated: a hypothesis that disabling `<Link prefetch>` on the header nav
would shrink the JS shipped on `/` turned out to be wrong — the flagged bytes
were core framework/vendor chunks loaded regardless, verified by diffing the
actual network requests with prefetch on and off, and the change was reverted
rather than kept on faith. And an apparent `best-practices` regression
("errors-in-console", two 500s) traced back to a stray orphaned server process
still bound to the audit port from an earlier restart — `npm start &`'s
captured PID is the `npm` wrapper, not the `next-server` child, so `kill`ing it
does not free the port. Not a code bug; the fix was `lsof -tiTCP:<port> | xargs
kill` before every re-run, not a source change.

**Lighthouse mobile vs desktop.** The default CLI preset simulates a
throttled mobile connection and a 4x-slowed CPU — appropriate for a public,
mobile-first site, and it holds every route here to the low 90s on
Performance even after the fixes above, entirely on Largest Contentful Paint:
the breakdown shows time-to-first-byte around 2 ms and element render delay
around 40 ms, with the remaining ~3 s being simulated network latency applied
to an internal tool's JS payload, not real slowness. This app's actual
persona — Nadia, the operations coordinator (see "Who this is for") — works
from a desktop browser on an ordinary connection, which is what
`--preset=desktop` models. Audited both ways rather than reporting only the
flattering one: mobile-simulated sits in the low-to-mid 90s across all three
routes; desktop is **100/100/100/100 on Performance, Accessibility, Best
Practices and SEO, on `/`, `/documents` and `/upload`**, confirmed over
multiple runs.

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

The upload path is the one request in the app that does not go through the
shared `fetch` client. `fetch` still cannot report upload progress in any
shipping browser, so ingest uses `XMLHttpRequest` for its
`upload.onprogress` events. The bytes are genuinely sent and genuinely
discarded server-side — the progress bar reflects bytes leaving the machine
rather than an animation timed to look plausible.

The ingest route carries a deliberate delay (`SIM_INGEST_LATENCY_MS`, 700 ms by
default). Over localhost a 2 MB upload completes in single-digit milliseconds,
which makes progress, pause and cancel impossible to see and therefore
impossible to judge.

**Refused files are reported, never dropped.** The dropzone validates type and
size client-side as well as server-side — rejecting a 30 MB scan *after* it has
finished uploading wastes the operator's time and bandwidth — and anything
refused is surfaced with a per-reason breakdown and an itemised list. Dropping a
folder of 300 and quietly enqueuing 288 is the worst kind of failure, because it
looks like success; nobody notices the twelve missing documents until months
later. The "select a folder" path runs the same checks, since a plain file input
bypasses the dropzone's validation entirely and a real field folder is full of
`thumbs.db` and stray spreadsheets.

The breakdown is tallied as files arrive rather than counted off the retained
list, which is capped at 50 entries — deriving it from the capped list would
print "300 files were not added: 48 unsupported", and a summary whose parts do
not sum to its total is worse than no summary.

Two smaller decisions in the queue:

- **Aggregate progress is weighted by bytes, not file count.** Finishing a 1 MB
  file out of a 1 MB and a 9 MB pair is 10% done, not 50%.
- **Cancelled files leave the denominator.** Otherwise a batch the operator
  deliberately stopped reads as permanently stuck at 23% instead of finished.

## The page is shown next to the fields

The operator's actual job is comparing what the machine read against what is on
the paper. Without the paper they cannot verify anything — only accept or guess
— so a review panel showing extracted values alone invites rubber-stamping.
Every serious tool in this category is a split screen for that reason.

The original scans are not kept (ingest receives the bytes and discards them),
so the panel renders a stand-in page. The important part is that it is **not
drawn freehand**: each value is placed inside the bounding box the server
reported for that field, and the highlight overlay reads the same boxes. The
preview and the data cannot drift apart because they are the same numbers.

`box` therefore lives on `FieldValue` in the schema, normalised to 0–1 the way
real extraction services return it (Google Document AI's normalised vertices,
Rossum's bounding boxes). Working the geometry out in the browser instead would
have modelled it backwards: where a value sits on the page is something the
extractor knows and the client cannot.

A missing field has **no box at all** rather than an empty one — there is
nothing on the page to point at, and drawing a rectangle anyway would be a lie
about where the extractor looked.

The link runs both ways: hovering or focusing a field highlights its box, and
clicking a box scrolls to the field. Focus is wired as well as hover, so
tabbing through the fields moves the highlight too.

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

## Four more Lighthouse findings that don't change the 100s, checked anyway

None of these carry any category weight — the desktop scores above were
already 100 with all four present — but "doesn't move the score" and "I looked
into it" are different claims, so here is the second one:

- **Render-blocking CSS, ~80 ms.** The single compiled Tailwind stylesheet for
  the whole app — every route, every shadcn component (92 KB source, 16 KB
  transferred, a normal ~5.7x gzip ratio). Cutting this further means critical-
  CSS extraction or per-route CSS splitting, disproportionate effort for 80 ms
  on a prototype.
- **"Legacy JavaScript", ~13 KB.** Traced to source rather than assumed:
  `node_modules/next/dist/build/polyfills/polyfill-module.js`. This ships in
  every Next.js 16 app regardless of `browserslist` config (there isn't one
  here — Next's modern-evergreen default applies) and regardless of whether
  `core-js` is even installed (it isn't). Not a project-level choice to undo.
- **Layout shift culprits.** CLS is 0 (score 1) on all three routes, reverified
  after a machine sleep interrupted the first pass. The one shift Lighthouse
  still lists on the overview page is the same benign, ~0.002-magnitude,
  purely horizontal one described above (the summary line's text growing from
  empty to full width) — not a new issue.
- **Network dependency tree.** Lighthouse's own `metricSavings` for this audit
  is `{"LCP": 0}` — by its own accounting there is nothing to save here; it is
  a request-chain visualisation, not an opportunity.

## What is mocked, and what the real thing would be

The mock lives entirely behind `src/lib/api/client.ts`. No component imports
anything below it, so swapping it for a real service is a change to one file.

A production version would be: presigned S3 multipart upload straight from the
browser, an ingest queue feeding an OCR worker pool, Postgres holding
`document` and `extracted_field` rows, and workers pushing status back over a
websocket or webhook. The frontend contract here was designed against that
shape — cursor pagination, id-only change events, per-field confidence — so the
swap does not require reshaping the UI.
