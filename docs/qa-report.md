# QA report

Manual and scripted test pass against the running app (`npm run dev`, port
3001) plus the eight API route handlers directly.

**Status: all five findings fixed and re-verified.** Each section below is
kept as it was written during the original pass — the finding, the repro, the
root cause — with a **Resolution** block added underneath recording what
changed and how it was re-checked. The findings themselves are left intact
rather than edited away, on the theory that the reasoning that led to a fix is
worth as much as the fix itself.

**Method:** adversarial testing against real running instances, not code
review. Every finding includes how it was produced and what was actually
observed, so each is reproducible rather than asserted. Where something was
checked and turned out fine, that's recorded too (see "Checked, no issue
found") — a QA pass that only lists problems makes it hard to tell what was
actually covered.

**Scope:** the 8 API routes, the documents table and filters, the upload
queue, the detail/review panel, and cross-cutting concerns (XSS, race
conditions, browser history, URL tampering). Not covered: multi-tab/multi-user
concurrency, real network failure injection (offline/slow-3G), assistive-tech
testing with an actual screen reader (noted as a gap in `ASSUMPTIONS.md`
already).

---

## Findings

### 1. Browser Back does not close the detail panel — Medium

**What happens:** open a document from the table (`/documents?doc=X`), then
press the browser's Back button. The detail panel does not close. Instead the
page jumps to whatever full navigation preceded it in history — in testing,
that landed on a *different, unrelated* document opened several actions
earlier, with the panel still open throughout.

**Root cause:** `useSelectedDocument()` in
`src/features/documents/hooks/use-document-filters.ts:91-93` calls
`useQueryState('doc', parseAsString)` with no `history` option, so it uses
nuqs's library default (`replace`). Every document opened this way **replaces**
the current history entry instead of pushing a new one, so there is no
"list view" checkpoint between documents for Back to land on. Contrast this
with `useDocumentFilters()` a few lines above, which sets
`history: 'replace'` **explicitly** — for filters that's a reasonable choice
(nobody wants a new history entry per keystroke in the search box), but the
detail panel is exactly the kind of state — a modal/sheet opening — that users
expect Back to undo, particularly on mobile where the OS back gesture is the
primary way to dismiss a sheet.

**Repro:**
1. Go to `/documents`, click any row (URL becomes `?doc=A`).
2. Click a different row (URL becomes `?doc=B`, no new history entry created).
3. Press Back.
4. Expected: panel closes, back to the list. Actual: URL/panel jump to
   whatever came before step 1, not to "no doc open."

**Suggested fix:** give the `doc` param its own explicit `history: 'push'` (or
handle it as a distinct, intentional exception) so opening a document is a
real history step, separate from filter changes.

**Resolution:** exactly that — `useSelectedDocument()` now calls
`parseAsString.withOptions({ history: 'push' })`
(`use-document-filters.ts`). Re-verified in the browser: opened document A,
then document B (two separate history entries now), pressed Back once →
landed correctly back on A with the panel still open; pressed Back again →
panel closed, plain `/documents`. Filters keep their original `replace`
behaviour — this only changes the one param that represents "a modal is
open."

---

### 2. Mutation buttons have no synchronous double-submit guard — Medium

**What happens:** three rapid clicks on a mutation button fire three network
requests, not one. Confirmed on all three mutation triggers tested:

| Trigger | Clicks | Requests fired |
|---|---|---|
| Single document retry (`Retry this document`) | 3 | 3 |
| Field correction `Confirm` | 3 | 3 |
| Bulk `Retry failed` (3 rows selected) | 3 | 3 |

**Root cause:** every one of these buttons uses `disabled={mutation.isPending}`
as its only guard, e.g. `document-detail-sheet.tsx` (`disabled={retry.isPending}`,
`disabled={correct.isPending}`) and `documents-view.tsx`'s retry handler.
`isPending` only flips to `true` after React commits the next render; several
synchronous clicks (a real user double-click, or a stuck trackpad) queue
before that commit and all read the pre-click, not-yet-pending state.

**Why this hasn't caused a visible bug yet:** the server-side handlers happen
to be idempotent by construction — `archive.retry()` re-checks
`status === 'failed'` per id, so a document already flipped to `pending` by
request #1 is correctly refused (`notFailed`) by requests #2 and #3, and
`archive.correct()` just re-applies the same draft value. No data corruption
was observed in any of the three cases. What *is* real: 2-3x the intended
network traffic per accidental double-click, and (not confirmed either way —
toasts had already dismissed by the time this was checked) the potential for
stacked/flickering duplicate toasts, which would read as "did that actually
work?" to an operator.

**Suggested fix:** a synchronous ref-based lock (`if (lockRef.current) return;
lockRef.current = true`) or disabling `event.currentTarget` directly in the
click handler, rather than relying solely on `isPending`. Cheap, and closes
the gap for good regardless of render timing.

**Resolution:** added `useSingleFlight()` in `use-document-mutations.ts` — a
small wrapper around `mutation.mutate` using exactly that ref-based lock,
released in the mutation's own `onSettled` so it can't stick if a request
fails. It forwards any per-call options through (the field-correction button
passes its own `onSuccess` to close the editor, which still needed to fire).
Both `useRetryDocuments()` and `useCorrectField()` now return this guarded
`mutate` instead of the raw one, so single retry, bulk retry, and field
correction are all covered from one place rather than three separate
patches. Re-verified with the same triple-click test as the original
finding — single retry, field-correction confirm, and bulk retry each now
fire **1** network request for 3 rapid clicks, down from 3, and the
field-correction editor still closes correctly afterward.

---

### 3. Invalid filter values fail silently, with no feedback — Low

**What happens:** `/documents?status=garbage` (a typo, or a hand-edited URL)
returns the full unfiltered 100k+ archive with no indication anything was
wrong. Same for an invalid `sort` value or a corrupted pagination `cursor`.

This is confirmed **working as designed** —
`src/server/http.ts`'s `parseFilters`/`parsePagination` deliberately fall back
to defaults on a parse failure rather than 400ing, and the reasoning is
recorded in the file: *"a hand-edited URL should degrade to 'show me
everything', not to an error page."* That's a defensible choice for a
prototype. Flagging it anyway because there's a real, if minor, UX cost: if an
operator bookmarks or shares a filtered link and a status value is later
renamed (e.g. `needs_review` → something else in a future iteration), every
saved link silently starts showing the *entire* archive instead of erroring —
which is a much quieter failure than the recipient would expect.

**Suggested fix (optional, not clearly worth it):** a dismissible banner when
a filter param fails to parse — "some of the filters in this link weren't
recognised and were ignored" — rather than no signal at all. Low priority; the
current behaviour is a legitimate trade-off, not a defect.

**Resolution:** implemented the suggested banner rather than leaving it as a
documented trade-off, since it's cheap and closes the gap without reversing
the underlying decision (bad values still fall back to "show everything" —
this only adds visible feedback that it happened).
`findInvalidFilterParams()` (`lib/invalid-filter-params.ts`) independently
re-validates the raw URL against the same enums the parsers use, flags a
comma-list param if *any* entry in it is bad, and deliberately does not check
`q` (free text has no invalid values). `useInvalidFilterParams()` keys
dismissal to the specific set of bad keys, so editing the URL to point at a
*different* invalid value re-shows the banner even if an earlier one was
dismissed. 7 unit tests cover the matching logic directly. Re-verified live:
`?status=garbage` shows "The status filter in this link wasn't recognised" /
Dismiss removes it / a valid filter shows nothing.

---

### 4. Uploaded filenames are stored without normalization — Low

**What happens:** `POST /api/uploads` with a filename of
`../../../etc/passwd.pdf` is accepted (`201`) and the path-traversal string is
stored verbatim as `fileName` and returned in every subsequent API response.

```
curl -X POST /api/uploads -F "file=@x.pdf;filename=../../../etc/passwd.pdf"
→ 201 {"fileName":"../../../etc/passwd.pdf", ...}
```

**Verified NOT exploitable in the current app** — checked directly rather than
assumed:
- The mock backend never touches a real filesystem with this string (no
  `fs.writeFile`/S3 key built from it); it's a display value only.
- Rendering was checked in both places the value reaches the DOM: the table
  row and the SVG document-preview `<text>` node. React's default JSX escaping
  covers both — confirmed live with a `<script>alert(1)</script>` payload in a
  different field (`personName`, via the field-correction endpoint, which has
  the same gap): it rendered as inert visible text in both the HTML table and
  inside the SVG, no `<script>` element was inserted into the DOM, and no
  alert fired.

**Why it's still worth a line in this report:** `ASSUMPTIONS.md` documents
that a real backend would be "S3 presigned multipart upload." If a future
implementation ever uses the client-supplied filename to build a storage key
or filesystem path — a very easy mistake to make — this exact input is a
classic traversal/injection payload, and there is currently no server-side
rejection of `..`, leading slashes, or control characters in filenames to
catch it. Cheap to add now, before there's a real storage layer to protect.

**Resolution:** added `normalizeUploadFileName()`
(`lib/domain/upload-constraints.ts`), wired into the upload route before the
filename ever reaches `archive.enqueue()`. It normalises rather than rejects
— keeps only the last path segment, strips control characters (including the
null byte) and any leading run of dots, caps length at 200 — on the reasoning
that a real operator's unusual filename is far more likely than an attack,
and the cost of over-rejecting (a confused field worker) is worse than the
cost of a stripped-down display name. `../../../etc/passwd.pdf` now becomes
`passwd.pdf`; re-verified against the live route
(`fileName: "passwd.pdf"` in the response). 6 unit tests cover traversal on
both path styles, control characters, the empty/whitespace fallback, and the
length cap.

---

### 5. Zero-byte files are accepted by upload — Low

`POST /api/uploads` with an empty (0-byte) file returns `201` and enters the
processing queue like any other document. There's a `MAX_UPLOAD_BYTES` upper
bound (25 MB) but no lower bound. An empty file can't meaningfully contain a
scanned form, so this is likely worth a minimum-size check alongside the
existing maximum, mirroring the same `422 FILE_TOO_LARGE`-style rejection
that's already in place for oversized files.

**Resolution:** added `MIN_UPLOAD_BYTES` (64 bytes — comfortably below the
smallest realistic scan, so it only catches empty or near-empty garbage, not
legitimately tiny images) and a `422 FILE_TOO_SMALL` check in the upload
route, mirroring the existing `FILE_TOO_LARGE` shape exactly. No client
changes were needed: the upload store classifies retryability by HTTP status
(4xx = don't retry), not by parsing the error code, so the new 422 is handled
correctly for free. Re-verified against the live route — a 0-byte file and a
30-byte file both now `422`; a 209-byte file uploads normally.

---

## Checked, no issue found

Recorded so the coverage of this pass is legible, not just its complaints.

- **SQL/query injection surface:** none — there's no SQL; the in-memory store
  is plain JS objects/Maps. N/A rather than passing, but checked.
- **API boundary handling** — `GET /api/documents`: `limit=999999`,
  `limit=-5`, `limit=0` all correctly fall back to the schema default (100)
  rather than erroring or hanging; invalid `status`/`sort` values are ignored
  per finding #3's documented behaviour; a corrupted pagination `cursor`
  correctly falls back to page 1 rather than crashing.
- **`GET /api/documents/[id]`** — path traversal (`../../etc/passwd`), a null
  byte, and an absurdly long id all return a clean `404`, not a 500 or a stack
  trace.
- **`PATCH /api/documents/[id]/fields`** — empty value, whitespace-only value,
  a 500-character value (over the 200 cap), an unknown field key, a
  nonexistent document id, malformed JSON, and a missing body: all correctly
  `400`/`404` with a JSON error body, none crash the server.
- **`POST /api/documents/retry`** — empty `ids` array, 6,000 ids (over the
  5,000 cap), a malformed `filter` object, and a body with neither `ids` nor
  `filter`: all `400` with a clear message.
- **`POST /api/scale`** — negative size, size over the 1,000,000 cap, and a
  request with no body at all (defaults applied correctly): all handled.
- **`POST /api/uploads`** — missing file field, oversized file (>25 MB),
  disallowed MIME type: all correctly `400`/`422` with a specific reason.
- **XSS via query params** — `?sort=<img src=x onerror=alert(1)>` and
  `?status=hacked` in the URL: page renders normally, no console errors, no
  script execution, values are simply ignored by the enum parser.
- **404 for a nonexistent document id in the URL** — clean "Not found" state
  with working "Try again"/"Close" actions; rest of the page stays
  interactive underneath.
- **Small/mobile viewport** — a single-result search was checked at both a
  real desktop size (1280×900) and a real mobile size (375×812): rows render
  correctly at both. (An earlier version of this check produced a false
  alarm — a freshly created test tab defaulted to an un-resized ~320×200
  viewport before an explicit resize call, which collapsed the virtualized
  grid to zero visible rows. That was a test-harness artifact, not an app bug;
  recorded here so it isn't mistaken for one if re-investigated later.)
- **Header "select all" checkbox** — exists and works
  (`documents-table.tsx:287`); an earlier probe during this pass used a wrong
  selector and reported it missing, which was a test-script bug, not a
  product one.

---

## Original suggested priority (for context — all five are now done)

1. **#1 (Back button)** — the most likely to actually confuse a real operator,
   and the fix is small and localised (one line, `history: 'push'`).
2. **#2 (double-submit guard)** — no observed data corruption today, but the
   fix is cheap and the current safety net (idempotent server logic) is
   incidental, not designed-in; worth closing properly rather than relying on
   it staying true as the mutations evolve.
3. **#4 and #5 (upload validation)** — low urgency now (nothing to exploit
   yet), but both are the kind of gap that's far cheaper to close before a
   real storage backend exists than after.
4. **#3 (silent filter fallback)** — a documented, deliberate trade-off; only
   worth revisiting if saved/shared filtered links become a real workflow.

## What changed, for a diff-free summary

| # | Fix | File(s) | New tests |
|---|---|---|---|
| 1 | `doc` URL param uses `history: 'push'` | `hooks/use-document-filters.ts` | — (browser-verified) |
| 2 | `useSingleFlight()` guard on retry + correct | `hooks/use-document-mutations.ts` | — (browser-verified) |
| 3 | Invalid-filter banner, dismissible | `lib/invalid-filter-params.ts`, `hooks/use-invalid-filter-params.ts`, `components/invalid-filter-banner.tsx` | 7 |
| 4 | `normalizeUploadFileName()` | `lib/domain/upload-constraints.ts`, `app/api/uploads/route.ts` | 6 |
| 5 | `MIN_UPLOAD_BYTES` + `422 FILE_TOO_SMALL` | `lib/domain/upload-constraints.ts`, `app/api/uploads/route.ts` | (covered by #4's suite) |

`npm run verify` (lint, typecheck, contrast, 82 tests, production build) is
clean with all five in place.
