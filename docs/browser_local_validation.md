# Browser-Local Validation

## Scope

- Branch: `kiseong/browser-local`, based on PR #1 commit `0d48dc9`.
- Desktop Chrome and Cloudflare Pages static output; no PR merge, push, hosting deployment or DNS changes.
- Existing Node mode retained. Claude skill port/testing is a separate TODO.

## Automated Checks

The browser tests exercise folder/document identity, overlapping connections, stale
hashes (including unchanged metadata), permission rejection, LF/CRLF/BOM preservation,
ambiguous Markdown rejection, durable recovery failure, close/readback failure,
duplicate-append prevention, shared-tab serialization and stale global order.
UI tests cover server API/SSE suppression, opaque routes, pending-permission route
preservation, external-image consent and existing Korean/English controls.

Fake handles and fake IndexedDB make failures repeatable; they do not validate Chrome's
OS permission dialogs, OS file replacement semantics or retained grants after restart.
The original Node server and web regression suites must continue to pass.

### Recorded On 2026-10-17

- `pnpm typecheck`: passed.
- `pnpm test`: 115 web + 83 server tests passed (198 total).
- `pnpm build` and `pnpm build:browser`: passed; the existing large-chunk warning remains.
- `ticket-md check` and strict `check-ledger.mjs`: passed for the seven-ticket document.
- Static output contains `_headers`, no top-level `404.html`, and a nine-file skill
  ZIP including references/assets/scripts and installation guidance. Version: `5de20d3cd601`.
- An isolated Chromium 155.0.8059.85 session exercised real IndexedDB, OPFS directory
  and file handles, writable streams, and Web Locks. The folder picker was stubbed to
  return that browser-owned temporary directory; no real OS folder selection was tested.
- The UI appended one manual direction, retained it through a deep-link reload, and
  made zero `/api/` resource requests. Two actual pages submitting the same snapshot
  produced one successful save and one `STALE_FILE`, not duplicate directions.
- At the separate static preview origin (`127.0.0.1:4187`), disabling network after
  load still allowed one UI append; readback showed exactly one direction, and reload
  after restoring network reopened the ticket. This is not a cold-offline/PWA test.
- Metadata caching after body eviction, permission and uncertain-write failures,
  timestamp-only events, and late observer disposal are covered by automated tests.
- The temporary browser and static preview were closed after verification. The
  browser development server remains available on `127.0.0.1:5187`.

### All-Projects Loading Follow-Up On 2026-10-17

- User observation: the first `/all` load after connecting a workspace root took
  about four minutes, and the refresh indicator continued to appear afterwards.
- The previous initial registration compared each new Markdown handle with every
  registered document. An in-memory fixture with 1,000 new documents recorded
  499,500 file identity comparisons and 1,000 full document-registry reads.
- The indexed implementation passes the same 1,000-document regression with zero
  pairwise file comparisons and one registry read. This measures operation counts
  with test handles, not elapsed time for real OS folders or IndexedDB latency.
- `/all` now reads only ticket bodies, without narrowing the connected folder
  scope. Ready projects appear before slow projects finish. Reads remain bounded
  to six documents across projects, and cancelled loads cannot publish late data.
- The 15-second board poll checks known tickets. Directory discovery runs again
  after 60 seconds since the last completed discovery, on manual refresh or a
  connection change, or when a known handle disappears. Unchanged bodies are reused.
- Initial loading shows project progress; background checks retain existing cards
  and show a separate status without spinning the refresh action. Tests cover both
  Korean and English, as well as manual refresh feedback.
- `pnpm --filter @alpha-kanban/web test`: 130 passed. Web typecheck and browser
  production build passed; the existing chunk-size warning remains.
- No browser visual smoke or real-workspace post-fix latency benchmark was run for
  this follow-up. The actual four-minute case still needs a reload and timing check.

### Project Loading And Shared Board Scroll Follow-Up On 2026-10-17

- Project deep links resolve the persisted document ID before sidebar discovery
  finishes. UI regressions cover tickets, plans, inventories and generic Markdown,
  a failed sidebar with an open draft, and a missing document without route fallback.
- Sidebar queries check known files every 15 seconds; completed directory listings
  are reused for 60 seconds. Explicit refresh, changed connections and missing/moved
  handles trigger discovery. Tests verify that a refresh cannot reuse/cache an older
  in-flight listing and that unchanged bodies are not read again.
- The selected-document observer reads only that document on its own schedule. It
  does not enumerate the project or emit initial changes for unrelated documents.
  Timestamp changes, removals, read failures, hidden tabs and disposal are covered.
- Both boards share one board scroll container and sticky status headers. Padding
  belongs to the inner grid; rounded clipping does not create a nested scroll box,
  and the top border is not drawn twice.
- An isolated Playwright/Chromium session rendered both actual board components
  with 72 synthetic tickets at 1440 x 900. After scrolling 600 px, all six header
  offsets from the board scroll viewport were 0 px, with no nested vertical scrollers.
  The all-projects check also scrolled horizontally and found no outer page overflow.
  Temporary fixture files and the isolated browser were removed/closed afterwards.
- Web tests: 142 passed. Web typecheck, browser build and Node-backed web build
  passed; the existing large-chunk warning remains. No production/OS-folder timing
  claim follows from the synthetic component or file-handle tests.
- At this stage document search/type filters were still a proposal; the follow-up
  below implements search and two exclusion conditions instead of type chips.

### Navigation And Document Filters Follow-Up On 2026-10-17

- Server and browser modes share the project name/path/status trigger, project rows
  and Start header. Browser Start shows up to five recent projects first and folds
  the other connected projects. Folder permissions, root connections, new-project
  actions and the inline skill guide remain available.
- The language selector uses the shared small select size to match toolbar buttons.
  The sidebar retains two header rows: real name/path search plus a filter popover,
  followed by the unchanged sorting controls. No standalone filter or type chips.
- The popover independently excludes plain Markdown and fully completed sets.
  Choices persist in localStorage; searching and filtering only operate on the
  loaded catalog. Matched groups retain their related documents, excluding plain
  Markdown only when requested. Empty results provide a reset action.
- `allTicketsDone` examines every ticket file in a set, leaving empty/unknown or
  inconsistent counts visible. The existing first-ticket-file progress badge and
  progress ordering remain unchanged. Both storage adapters provide this metadata;
  changing filters performs no scan, API call, document write or navigation.
- Regression tests cover combined filters, persistence/reset, Korean/English,
  an open instruction draft and plain-document deep link remaining intact, recent
  project order, the shared project trigger, and multi-ticket-file completion.
- `pnpm test`: 162 web tests and 84 server tests passed. `pnpm typecheck`,
  `pnpm build:browser`, and `pnpm build` passed; existing chunk-size warnings remain.
  The existing dev server returned HTTP 200 at port 5187. No browser visual smoke,
  real OS folder test, deployment or commit was performed for this follow-up.

## Manual Acceptance

Use disposable copies of real Markdown, not active work records.

1. In desktop Chrome, open `http://127.0.0.1:5187`, choose and cancel a project/root picker, then allow read access. Check nested roots and same-name projects.
2. Open plan, inventory, generic Markdown and a ticket board. Switch language, detail mode and document sorting. Reload a deep ticket URL.
3. Allow editing from Local folders. Save a manual instruction, change status with a reason and reopen DONE. Check the source, unrelated ticket, checklist, notes and top-level count.
4. While a reason or direction is being drafted, edit the same file in an external editor. Verify the notice, rejected stale save and retained draft. Test file removal, rename and atomic replacement.
5. Open two tabs, edit the same snapshot and reorder global cards from both tabs. One stale operation must fail without duplicate instructions or silently overwriting another order.
6. Revoke permission, reload, grant again, then restart Chrome. Verify that the deep link remains while permission is pending. Test unavailable folders without hiding other projects.
7. Test a failed/uncertain save and recovery downloads, including storage quota failure. Never label a successful status write as failed only because card order failed; retry order alone.
8. After initial load, disable network and read/save local files. Do not expect a cold offline load to work.
9. Test local relative image/Markdown links, out-of-project links, and a remote image: no remote image request before consent, no execution of SVG/HTML.
10. Test a staged Cloudflare Pages build at a stable origin: directly visit `/all` and `/w/:id?doc=...#ticket=...`, verify CSP and no API requests. This requires separate deployment authorization.
11. On the root that previously took about four minutes, record time to first cards and to all projects completing. Observe background checks, change an existing ticket, and add a new ticket file; verify discovery within the next scheduled scan or immediately after manual refresh without losing an open draft.

## Open Verification

- Real user-selected OS folders, Chrome restart grants, actual external-editor races,
  and contributor-PC acceptance remain unverified until performed.
- Cloudflare-hosted routing/headers and future custom-domain behavior have not been
  observed live. A local Vite preview does not establish the hosting configuration.
- No global skill installation has been performed.
- Large real-workspace scan latency and real multi-tab resource usage have not been
  benchmarked. The body cache is capped at 64 MiB, but the all-projects view still
  needs to parse ticket documents that no longer fit in that cache.

## Known Boundaries

- Browser locks cannot exclude external editors or another origin/profile.
- Clearing browser data can erase connections, preferences and recovery copies, but
  does not delete original Markdown. Export a recovery copy before clearing site data.
- Directory reads are bounded and skip known generated/hidden directories. Very large
  workspaces should be connected at a more specific project folder.
