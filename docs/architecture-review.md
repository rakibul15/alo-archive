# Frontend architecture review

A senior-engineer read of the codebase as it stands — architecture, code
quality, error-boundary coverage, and a few cross-cutting concerns. Unlike
`qa-report.md` this isn't adversarial testing against a running app; it's
reading the source and judging the decisions in it. Every claim below was
checked against the actual code or a real build, not recalled from memory —
where that mattered, the evidence is shown.

**Overall:** the architecture is sound and the domain-modelling decisions
(schema-first types, keyset pagination, id-only SSE, per-field confidence) are
genuinely good. The findings here are mostly about **coverage gaps around the
edges of otherwise solid patterns** — one real correctness-adjacent
misconception (the React Compiler claim), a couple of files that outgrew a
single responsibility, and an error-boundary map with one real hole in it.
Nothing here is "rearchitect this."

---

## 1. Error boundaries — the one genuine gap

The codebase's own stated model (see `document-detail-sheet.tsx` and
`documents-view.tsx`) is three tiers: route-level `error.tsx`, a scoped
`react-error-boundary` around anything that can plausibly throw on real data,
and ordinary query/row state for anything the domain itself expects (a failed
document is data, not an exception). That model is right. It just isn't fully
applied.

**What actually exists, checked directly:**

```
find src/app -name "error.tsx" -o -name "not-found.tsx" -o -name "loading.tsx" -o -name "global-error.tsx"
→ src/app/error.tsx   (and nothing else)

grep -rln "ErrorBoundary" src/
→ src/features/documents/components/documents-view.tsx   (one file)
```

- **One `error.tsx`, at the root.** No per-route `error.tsx` for `/documents`
  or `/upload` — not necessarily wrong (a shared fallback is a reasonable
  default), but it means every route currently has the *same* generic
  recovery UI regardless of what was being done when it broke.
- **No `global-error.tsx`.** This is the one that actually matters. A regular
  `error.tsx` is rendered *inside* the root layout, so it cannot catch an
  error thrown by the layout itself — `Providers`, `AppHeader`, or a
  `next-themes`/hydration failure at that level would have nothing to catch
  it, and the user would see either a blank page or Next's raw dev overlay
  (in production, an unstyled default). `global-error.tsx` is the only file
  that sits above the root layout and can catch that.
- **No `not-found.tsx`.** Next's default 404 works, but it's unbranded and
  won't match the rest of the app.
- **`react-error-boundary` is used in exactly one place** — wrapping
  `DocumentsTable` inside `documents-view.tsx`. That specific choice is well
  reasoned (a comment explains why: if the virtualizer throws, the filters
  above it should stay usable). But look at what's a *sibling* of that
  boundary, not a child of it:

  ```tsx
  // documents-view.tsx
  <QueryErrorResetBoundary>
    <ErrorBoundary>
      <DocumentsTable ... />
    </ErrorBoundary>
  </QueryErrorResetBoundary>

  <DocumentDetailSheet ... />   {/* ← no boundary of its own */}
  ```

  `DocumentDetailSheet` is the single most complex client component in the
  app — inline field editing, focus management, an SVG preview with
  bounding-box math derived from server data. It has no error boundary at
  all. If it throws, it isn't caught by the table's boundary (it's a sibling,
  not a descendant); it propagates straight to the root `error.tsx`, taking
  the entire `/documents` route down — table included, even though the table
  was working fine. That directly contradicts the stated design goal
  ("filters stay usable if the virtualiser throws") for the component most
  likely to actually hit an edge case.

  The same gap exists on `/upload` (`UploadView` → `UploadDropzone` +
  `UploadQueuePanel` + `BatchSummaryCard`, no scoped boundary anywhere) and on
  `/` (`StatusSummary` + `ScaleControl`, likewise). Those are simpler
  components with less surface area, so the risk is lower, but the pattern
  established for `DocumentsTable` was never carried anywhere else.

- **No global `unhandledrejection` listener.** `upload-file.ts` is careful —
  every `XMLHttpRequest` event (`abort`, `error`, `timeout`, `load`) is
  handled and turned into a typed `ApiError` — so the queue itself has no
  obvious leak. But there's no top-level safety net catching a promise
  rejection that escapes *despite* that care (a bug in a `.then()` chain
  somewhere, a third-party library rejecting unexpectedly). React error
  boundaries fundamentally cannot catch these — they only catch errors thrown
  during render — so this is a different, complementary mechanism, and
  currently there isn't one.

**Suggested fix, roughly in priority order:**
1. Add `src/app/global-error.tsx` — cheap, and it's the only one of these that
   covers a class of failure nothing else can.
2. Give `DocumentDetailSheet` its own `ErrorBoundary`, matching the reasoning
   already written down for the table.
3. A `window.addEventListener('unhandledrejection', ...)` in `providers.tsx`
   that at minimum logs and surfaces a toast, so a silent failure isn't
   silent.
4. `not-found.tsx` and per-route `error.tsx` are lower priority — the current
   shared fallback is a legitimate choice, just worth being a deliberate one
   rather than an implicit one.

---

## 2. A load-bearing misconception: the React Compiler isn't running

Three separate comments in the codebase reason from the premise that the
React Compiler is active — most explicitly this one, in both
`documents-table.tsx` and `upload-queue-panel.tsx`:

> "React Compiler cannot memoize a component that consumes `useVirtualizer`
> — the hook hands back fresh function identities every render by design...
> The compiler therefore skips this component..."

This is a real, correct fact about the React Compiler in general — but it
only matters if the compiler is actually running, and **it isn't, in this
project.** Checked directly rather than assumed:

```
grep -i "react-compiler\|babel-plugin-react-compiler" package.json
→ (nothing)

cat next.config.ts
→ const nextConfig: NextConfig = {};   (no experimental.reactCompiler)

find . -maxdepth 1 -iname ".babelrc*" -o -iname "babel.config*"
→ (nothing)
```

To be certain rather than inferring from absence, I searched the actual
production build output for the compiler's runtime marker:

```
grep -c useMemoCache .next/static/chunks/*.js
→ appears twice, both inside React's own internal hook-dispatcher table
  (oP/oN objects listing every hook React ships, compiled or not) —
  not inside any application component. No app code calls it.
```

So: nothing was ever wired up to run the compiler — no plugin, no config, no
babel setup — and the build output confirms no application component was
actually transformed. The `eslint-disable-next-line
react-hooks/incompatible-library` comments are real (that ESLint rule ships
with `eslint-config-next` and fires independently of whether compilation is
enabled), but the reasoning built on top of them — "the compiler already
handles the rest of this file's memoization, this one component is the
exception" — describes a compiler that was never there. **Every component in
this app is running with zero automatic memoization**, full stop, not "zero
except for a few compiler-skipped ones."

This mostly hasn't mattered in practice — the app is correctly virtualized so
render counts stay small (~30 DOM rows regardless of archive size), and
manual `useCallback`/`useMemo` is applied carefully in the hot paths that
were written with performance in mind (`use-selection.ts`, `use-media-query.ts`,
the mutation guard in `use-document-mutations.ts`). But the comments should
either be corrected to describe reality, or — better, since the payoff is
real for a table and a queue panel that both re-render on every scroll/tick —
the compiler should actually be turned on:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  experimental: { reactCompiler: true },
};
```

plus `babel-plugin-react-compiler` as a dependency. Worth doing rather than
just fixing the comments: `DocumentRow` inside `documents-table.tsx` is a
plain function component receiving freshly-allocated inline closures
(`onToggle`, `onOpen`) on every parent render, currently un-memoized in
either direction. Harmless at ~30 visible rows; the honest thing is to either
say so explicitly or turn the compiler on and let it handle it, rather than
carry comments that describe a safety net that isn't actually there.

---

## 3. Two files doing more than one job

```
655  src/server/archive.ts                        (server, noted for scale)
622  src/features/documents/components/document-detail-sheet.tsx
592  src/features/documents/components/documents-table.tsx
```

Size alone isn't a defect — both frontend files are legible, well-commented,
and every piece is actually used only in that file, so this isn't a call for
a sweeping refactor. But each does visibly more than one job in one file:

- **`document-detail-sheet.tsx`** is five things stacked: the `Sheet` shell
  and its Escape-key routing, `DetailBody`'s loading/error/success switch,
  `DetailContent`'s two-column layout, `FieldRow`'s entire inline-edit
  lifecycle (draft state, focus management, save/cancel), and `MetaRow`. Of
  these, `FieldRow` is the one with real independent complexity — it would
  read more clearly, and become independently testable, split into its own
  file the way `document-preview.tsx` already was.
- **`documents-table.tsx`** mixes the virtualizer wiring, keyboard
  navigation, the header row, `DocumentRow` (two full render branches for
  compact/full), `RowOutcome`, and `TableSkeleton`. Same shape of issue,
  same low urgency.

**A smaller, concrete inconsistency inside `document-detail-sheet.tsx`:**
`useRetryDocuments()` is correctly called once, in `DetailContent`, and
passed down implicitly through the single `retry.mutate(...)` call site.
`useCorrectField()`, by contrast, is called **inside `FieldRow`** — meaning
each of the six rendered fields (`EXTRACTED_FIELD_KEYS.map(...)`)
instantiates its own independent `useMutation`. In practice this is safe
(only one field is ever `isEditing` at a time, so only one of the six
`isPending` flags is ever visible), but it's six TanStack Query mutation
instances — six independent retry/backoff timers and `onSuccess`/`onError`
closures — for what is conceptually one action per document. Hoisting
`useCorrectField()` up to `DetailContent` (matching how `retry` is already
handled) and passing `correct` down as a prop would make the two mutations
consistent with each other and cut the instance count from 6 to 1.

**A minor duplication, same file:** the "Scanned as: …" block
(`field.raw !== null` → a small `<p className="font-mono text-xs …">`) is
written out twice — once in the editing branch, once in the display branch —
five near-identical lines each. Small enough that it's a nitpick, not a
finding on its own, but worth folding into the `FieldRow` split above if that
happens.

---

## 4. Testing gaps that break the project's own pattern

The codebase has a clear, good, explicitly-stated testing philosophy:
extract pure logic out of components/hooks into a `lib/` file, test that
directly, and rely on browser-driven QA for the hook/component wiring around
it. `selection.ts`, `queue.ts`, `invalid-filter-params.ts`,
`upload-constraints.ts` all follow this and are well covered. Two places
don't follow it, and both hold real branching logic:

- **`describeOutcome()` in `use-document-mutations.ts`** — the function that
  turns a bulk-retry `RetryOutcome` into the toast title/description (four
  distinct branches: nothing retried, some retried, some refused, some
  `notFailed`, plus singular/plural wording). It's a private function inside
  a `'use client'` hooks file, so it currently has zero direct test coverage
  — the only place its correctness has ever been checked is by eyeballing
  toast text during manual QA. It has no React dependency; it would cost
  nothing to move to `lib/` and test the same way `describeOutcome`'s sibling
  logic in `selection.ts` already is.
- **`request()` / `toQueryString()` in `lib/api/client.ts`** — this is *the*
  file the whole app funnels every network call through (the seam that makes
  swapping the mock backend for a real one a one-file change, per
  `ASSUMPTIONS.md`), and it has no test file at all. `toQueryString`
  specifically has the kind of edge cases unit tests exist for — empty
  arrays, `null` vs `undefined` vs `''`, array-to-comma-join — and getting
  one of those wrong would silently break a filter rather than throw.
- **`parseFilters()` / `parsePagination()` in `server/http.ts`** — the
  fallback-on-invalid-input behaviour that findings #3 and the QA pass's
  "checked, no issue found" section both lean on (`?status=garbage` degrades
  to "show everything" rather than erroring) has only ever been verified by
  hand, via `curl`, during that QA pass. It's exactly the kind of contract
  worth pinning down in a test so a future change to the parsing logic can't
  silently flip a 400 into a 200 or vice versa without a test noticing.

None of these are large gaps — a handful of files, each already close to
being test-shaped — but they're the ones where the project's own standard
was quietly not applied, which is worth more than a randomly-selected gap
would be.

---

## 5. What's genuinely good, for balance

A review that only lists problems makes the good decisions invisible. Worth
naming, because these are the parts a less careful implementation gets
wrong:

- **Schema-first domain modelling.** Every type in `lib/domain/document.ts`
  is `z.infer`'d from a Zod schema, so the API boundary, the fixture
  generator, and the UI's types can never drift apart from each other.
- **Keyset pagination**, not offset — chosen specifically so rows changing
  status mid-scroll (a live, simulated archive) can't shift the window and
  make the virtualizer skip or repeat rows. This is the kind of bug that's
  invisible in a demo and real in production; it was designed out up front.
- **The SSE contract sends ids, not documents** — the single decision that
  makes the whole app viable at 100k rows without either polling or a
  network flood. `useArchiveStream` then only re-fetches detail queries that
  are *already cached*, so a change to a document nobody has open costs
  nothing.
- **The selection model** (`include`/`exclude` + exceptions, in
  `selection.ts`) is a genuinely well-chosen representation — "select all
  100,000, deselect three" is three strings either way round, and it's pure,
  tested, and framework-free.
- **The colour-token discipline** — an ESLint rule that rejects raw palette
  classes, plus a script that parses `globals.css` directly (so it cannot
  drift from the values it's checking) and gates the build on WCAG AA. Rare
  to see enforced rather than merely documented.
- **`useSingleFlight`** (added during the QA-fix pass) is exactly the right
  shape of fix for the double-submit bug it closes — a synchronous ref-based
  lock rather than trusting `isPending`, applied once and shared by both
  mutations rather than patched at each of the three call sites separately.

---

## Summary table

| # | Finding | Severity | Effort to fix |
|---|---|---|---|
| 1a | No `global-error.tsx` | Medium | Trivial |
| 1b | `DocumentDetailSheet` has no error boundary | Medium | Small |
| 1c | No global `unhandledrejection` handler | Low | Small |
| 1d | No `not-found.tsx` / per-route `error.tsx` | Low | Small, optional |
| 2 | React Compiler comments describe a compiler that isn't enabled | Medium | Small (fix comments) or Medium (actually enable it) |
| 3a | `document-detail-sheet.tsx` / `documents-table.tsx` do several jobs each | Low | Medium (optional refactor) |
| 3b | `useCorrectField()` instantiated 6× instead of hoisted once | Low | Small |
| 3c | "Scanned as" markup duplicated in `FieldRow` | Trivial | Trivial |
| 4 | `describeOutcome`, `client.ts`, `server/http.ts` untested despite being pure logic | Low–Medium | Small per item |

Nothing above is a correctness bug in the sense the QA pass was hunting for
— everything the app does, it does correctly. This is a different kind of
review: where the next real bug is *likely to come from* if the codebase
keeps growing at its current pace, and where the code's own stated reasoning
doesn't quite match what's actually running.
