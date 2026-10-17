# PWA Operations and Preservation

## Boundaries

- Production origin: `https://kanban.giveit2.me`; worker URL `/sw.js`; manifest id/start/scope `/`.
- No DNS or public deployment was authorized with this implementation. Verify the actual Cloudflare response headers and installation before promoting it.
- Chrome desktop is the target. A standalone PWA window does not add Node privileges, filesystem-wide access, AI execution or permanent folder watching.
- App build ID is a content hash plus an optional CI `AK_RELEASE_REVISION`. Skill bundle hash is separately reported in release metadata. Semantic skill/Markdown compatibility remains owned by AKL-10..13; null is unknown, not a guessed version.

## Build Modes

```sh
pnpm build:browser
pnpm preview:browser
pnpm test:pwa

# Generate local emergency artifacts, without publishing them:
pnpm build:browser:recovery
pnpm build:browser:retired
```

All build modes write `apps/web/dist-browser`. Keep separate copies of verified
releases when rehearsing an incident. Normal `build:browser` restores the regular
PWA build after an emergency build. Do not publish an emergency artifact by accident.
The smoke script builds its own versions under ignored `output/playwright/` instead
of overwriting `dist-browser` or touching user browser data.
It uninstalls the test app and removes the temporary Chrome profile after checking
preservation. `PWA_KEEP_PROFILE=1` retains that isolated profile for debugging;
delete it after inspection. Logs, build artifacts and screenshots remain available.

- **Normal**: complete integrity-checked Workbox precache, conditional install entry and controlled update UI.
- **Recovery**: a request-neutral worker at the same `/sw.js`, normal app without new registration code. Activation normally waits until old controlled windows close. This removes the broken fetch behavior without depending on the old app bundle running. Keep old caches initially.
- **Retired**: stop registering in the new app and continue serving the same `/sw.js` tombstone. After verifying the retirement release online, it removes only owned app caches when no active session holds the lease, then unregisters itself. If it activates offline, it temporarily serves the last complete cached app on network failure; it retries retirement on later navigation. It does not delete the only usable offline app or forcibly reload open windows. DB and settings remain.

Never delete `/sw.js` as the retirement procedure, rename it per release, unregister
all origin registrations, clear all caches, or send `Clear-Site-Data`. Keep the
retirement worker available indefinitely while the origin is operated. Offline or
non-returning clients cannot be remotely purged; an abandoned origin cannot deliver
a later tombstone. Retain the origin/worker URL inventory below across deployments.

| Origin | Worker URL | State |
| --- | --- | --- |
| `https://kanban.giveit2.me` | `/sw.js` | Planned production; deployment not performed |
| Isolated localhost origin per `test:pwa` run | `/sw.js` | Test profile only; browser closed after run |

## Preservation Contract

| Data | Location | Update / Repair / Retirement |
| --- | --- | --- |
| App HTML, JS, CSS, icons, fonts, fixed skill bundle | `alpha-kanban-app-v1-*` CacheStorage | Replace only complete releases; clean only owned obsolete assets |
| Connections and project/file handles | IndexedDB `alpha-kanban.browser.v1`, `records` | Preserve |
| Project/document IDs and `document-path:*` index | Same DB | Preserve identities; no rebuild by deletion |
| Recent project, last selection, board order | Same DB | Preserve |
| Pending `recovery:*` preimage/intended/hash records | Same DB | Preserve; never replay or dismiss automatically |
| Locale, auto-open, sidebar size, filters/sorts, ticket detail presentation | Existing localStorage keys | Preserve |
| Status/reason/manual-instruction/new-project drafts | React state | Refuse live activation until explicitly saved or discarded |
| Loaded document/listing cache | Repository memory | Regenerated after a safe reload |
| Original Markdown and local resources | User filesystem | No update/repair/retirement writes |

Schema remains version 1; this release requires no migration. IndexedDB's versioned
open refuses a newer database rather than downgrading/resetting it. Future migrations
must be explicit, transactional, tested across skipped versions and failed commits,
and coordinated with the session lease. A rollback build must understand the already
stored schema; roll forward a repair if it does not.

Persistent storage is a browser request, not a promise against manual site-data
deletion, a new profile/origin, OS cleanup or revoked folder permissions. Keep the
existing reconnect and uncertain-save recovery UI.

## Update Safety

1. The old worker serves a complete old release while a new worker verifies every precached asset, including files not yet visited and all Korean font subsets. Missing files, substituted SPA HTML and failed writes cannot mark the new release ready.
2. Live application asks all app clients to prepare. Drafts or active operations refuse. A prepared client freezes its whole UI, rejects new mutations and releases its shared session lease.
3. The waiting worker obtains the exclusive lease and rechecks the client set. Unknown/unresponsive/new windows abort the attempt. Prepared windows resume with their drafts untouched.
4. Only the prepared transaction triggers activation and reload. New or suspended old-code pages compare against the active build before mounting/writing. No unconditional controller-change reload is used.
5. Old caches are collected only when every responding app client uses the active build, no other update is pending, and asset/session locks allow it. Partial installs do not evict the active release.

`offline-ready.json` is part of the integrity-checked precache, not an application
data record. The retirement worker checks its asset inventory before using an old
cache as a temporary offline fallback; a failed partial install cannot replace a
complete release. This does not make the request-neutral recovery worker an
offline repair tool: repair still requires a healthy online deployment.

## Repair and Incident Drill

`/repair.html`, `/repair.js` and `/repair.css` have no app-bundle dependency. They are
excluded from normal worker navigation/cache matching, as are `/release.json`,
`/offline-assets.json` and `/sw.js`. Repair fetches use a noncached query marker and
the build's integrity inventory. It verifies the whole normal release before
refreshing its cache; registration and cache cleanup are ownership-limited.

1. Verify a healthy static build is available online with the intended MIME/CSP/cache headers. Do not clear the last cache offline.
2. Ask the user to finish their edits and close all other app tabs/windows. Open `/repair.html`, download app files again, then return to the app.
3. If a broken worker intercepts even the repair page, deploy the recovery build at the **existing** URL after obtaining separate deployment approval. The browser's worker update request does not depend on the app's fetch handler. Have the user close all controlled windows and revisit; fully quit and reopen Chrome if the old worker still holds the page. Do not force-discard an unknown draft. Verify that the replacement finished installing before counting a restart as a completed recovery.
4. Verify the request-neutral worker and data preservation, then deploy a tested normal build with a compatible data schema. Close/reopen any old recovery-build windows that cannot participate in a live update handshake.
5. For permanent retirement, publish the retired build, verify no new registrations occur, confirm old registration/caches are removed while another app's registration/cache survives, and keep the tombstone URL served.

Static local preview can verify application behavior, not Cloudflare's actual
headers, DNS, TLS, edge fallbacks or origin identity. Missing assets must not become
cached HTML; deploy all files atomically. The build inventory/SRI rejects an
incomplete deployment even if the hosting SPA fallback responds with 200.
