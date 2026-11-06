# Deployment

This guide is for the project owner or an authorized maintainer operating the hosted app. Skill users can install from the official repository and use [the hosted viewer](https://kanban.giveit2.me/) without building or deploying anything. See [Contributing](../CONTRIBUTING.md) for local setup.

## Production identity

- Public origin: `https://kanban.giveit2.me`.
- `/`: project workspace and PWA entry point.
- `/about`: introduction and skill installation guide.
- `/sw.js`: stable service worker URL. Manifest `id`, `start_url`, and `scope` remain `/`.

Keep this origin and PWA identity stable across releases. Folder handles and settings are stored per origin and browser profile; changing the address does not migrate them. The local Markdown files remain on disk.

## Cloudflare Pages configuration

Use the operator's existing Pages project and custom-domain settings. Account access, deployment credentials, and DNS administration belong in the hosting service or an approved secret store, not this repository.

| Setting | Value |
| --- | --- |
| Build command | `pnpm build` |
| Output directory | `apps/web/dist-browser` |
| Public custom domain | `kanban.giveit2.me` |

## Channel selection and promotion

Both channel definitions live in `apps/web/release-channel.mjs`. The channel is a build setting, separate from the source branch and `AK_PWA_MODE=app|recovery|retired`. Keep both definitions when merging tested changes into master; build master again with `stable` instead of copying a canary artifact.

| Setting | Stable | Canary |
| --- | --- | --- |
| `AK_RELEASE_CHANNEL` | `stable` | `canary` |
| Pages target | Existing `alpha-kanban` project | Separate `alpha-kanban-canary` project |
| Branch | `master` | `release/canary` |
| Canonical origin | `https://kanban.giveit2.me` | `https://kanban-canary.giveit2.me` |
| Authored history | `apps/web/releases.json` | `apps/web/releases.canary.json` |

Keep the build command and output directory in the table above. Confirm the actual account/project configuration before the first deployment; this repository contract does not configure Cloudflare. Pages injects `CF_PAGES`, `CF_PAGES_BRANCH` and `CF_PAGES_URL`; the build requires an explicit channel and rejects a project or branch mismatch before packaging. [Cloudflare build environment](https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables)

For an authorized direct upload, supply the intended target when building and again when checking existing output. For example, in the separate canary checkout:

```sh
AK_RELEASE_CHANNEL=canary AK_DEPLOY_PROJECT=alpha-kanban-canary AK_DEPLOY_BRANCH=release/canary pnpm build
AK_RELEASE_CHANNEL=canary AK_DEPLOY_PROJECT=alpha-kanban-canary AK_DEPLOY_BRANCH=release/canary pnpm check:release apps/web/dist-browser
```

The check validates the channel/origin, manifest, complete offline asset digests, repair metadata and pinned skill archive/payload before upload. It rejects canary output checked against the stable target. It does not perform the upload or control a manually invoked hosting CLI; the operator must use the same verified target for that step. `AK_RELEASE_NOTES_FILE` is a local smoke override and is rejected for deployment builds.

Use separate work directories to build both channels. Generated downloads are tagged with their channel, and Vite refuses a mismatched package. `pnpm test:channel-builds` provides a repeatable comparison from one source snapshot. Recovery and retirement use the same channel setting and output checks. Missing channel metadata is accepted only as a historical stable release; canary requires explicit matching metadata.

The two origins retain the existing local storage, IndexedDB and cache keys independently. They do not isolate the physical files if both apps connect to the same folder. Test with disposable copies and preserve each origin's recovery records.

Use the Node.js and pnpm versions documented in [Contributing](../CONTRIBUTING.md), and install dependencies from the lockfile before building. Publish the complete output, including the generated service worker, repair files, skill archive, fonts, and `_headers`.

Serve the app over HTTPS with SPA routing for `/`, `/about`, legacy `/intro`, `/all`, `/w/:id`, `/docs/*`, and `/releases/*`. The app redirects `/intro` to `/about` while preserving query strings and section hashes. Cloudflare Pages provides [default SPA handling](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering) when the output root has no `404.html`. Verify actual responses after deployment: worker scripts, release metadata, repair assets, and missing static assets must not be mistaken for the app's HTML shell.

## Release checks

1. Run the relevant application checks and build a complete release. For PWA lifecycle changes, run the isolated smoke tests before publishing.
2. Verify HTTPS, MIME types, cache/CSP headers, direct entry and refresh on the application routes, and the generated repair resources at the production origin.
3. Verify installation and offline readiness in desktop Chrome. Test an update with multiple windows, drafts, and a dedicated local test folder; confirm connections, preferences, and recovery records survive.
4. Check that the skill installation guide points to the intended official source. A web deployment does not update users' installed personal skills.

When a release offers skill replacement, run `pnpm test:skill-release` against the complete build, then `pnpm test:skill-release --origin https://kanban-canary.giveit2.me` after an authorized canary deployment (use the stable origin for an authorized stable release). This checks the actual release history, pinned JSON/ZIP and compiled update UI without changing compatibility metadata. Known official snapshots must expose a consent-gated update; modified installations must require separate reinstall consent. It verifies exact file contents, full backup, explicit restore and backup retention in isolated Chrome OPFS folders. Reports and screenshots stay under `output/playwright/`; this does not touch personal installations or replace native picker/OS tests.

`test:pwa` uses controlled release notes to exercise lifecycle transitions, including a deliberately compatible fixture. Its success is not evidence that the authored release allows skill replacement. Keep the actual-release check separate, and do not change `unknown` to `compatible` without reviewing the skill/document contract and its regression results.

## Release records

- Before authorizing a release, review `apps/web/releases.json`: bilingual user-facing notes, stable logical ID, increasing sequence, actual release date and automatic-notice policy. Do not rewrite published records to describe a different release. The pending local record is not a deployment receipt.
- `pnpm build` validates history and produces matching `release.json`, compiled notes and worker information. Publish the complete output together. Preserve no-store handling for `/release.json` and `/sw.js`; do not introduce a second-origin notes endpoint.
- Ship the versioned skill JSON, payload digest and complete ZIP together. The browser compares against its own build's pinned payload, not mutable GitHub master. Distinguish changes to skill rules from changes to installation or update management; unknown compatibility must route to agent review, not direct replacement. Meaningful skill/format version policy remains a separate tracked contract.
- Before enabling confirmed skill updates for users, review the native-folder, link/attribute and isolated-Codex results in [release and skill validation](release_skill_validation.md). Record any explicit owner-approved handoff of remaining checks without marking them passed. Passing OPFS tests alone is not release approval.
- Verify the notes for the actual waiting build before applying it, then the one-time project-selector modal and manual history. Preserve folder connections, preferences, release-read markers, skill connections and recovery journals through update, repair and retirement. Browser updates never imply approval to replace a user's skill.

Local previews establish application behavior, not production DNS, edge routing, headers, or OS installation behavior. Record deployment checks separately from local test results.

## 2026-11-06 canary skill-update correction receipt

The owner approved correcting the canary skill classification and republishing canary. The first corrected deployment came from `065328b` on `release/canary`, served as build `1a205effd49ccb9d` with release `2026-11-06-canary-skill-update` and unchanged skill-content bundle `54911d5cedca`. Later documentation-only rebuilds retain this logical release and bundle; their build and provenance hashes can differ.

- Cloudflare Pages reported success for `alpha-kanban-canary`. The custom origin served the authored `compatible` classification, matching source commit, worker, manifest, pinned JSON/ZIP and all 115 offline asset hashes. Every one of the 26 bundled skill files matched the reviewed source. Public workspace, About, docs and release routes returned the app with the expected headers.
- `test:skill-release --origin https://kanban-canary.giveit2.me` passed against the delivered app without intercepting release or skill responses. Both known official snapshots exposed a fresh-confirmation update, and an installation with an extra file required explicit reinstall review. Exact replacement, full exported backup, explicit restore and backup retention passed in isolated Chrome OPFS folders. The user's skill and existing browser connections were not used.
- Local and hosted JSON payloads matched. ZIP container timestamps differ between local KST and hosted UTC packaging; all extracted bytes matched and each served archive matched its own pinned digest. Build IDs were checked against the corresponding served worker and offline inventory, not assumed identical across these environments.
- Stable remained on build `ea940dda1a4191bc`, release `2026-11-05-stable-skill-reinstall` and bundle `3adcbdb5a017`. This correction did not publish to stable. The separate native dual-install and subsequent-update checks remain open in AKC-04/05.

## 2026-11-05 deployment receipt

The owner approved the canary deployment and a separate stable backport containing only skill comparison, complete backup and explicit reinstall. The team-document changes have not been promoted to master.

| Public service | Source commit | Served build | Release | Skill bundle |
| --- | --- | --- | --- | --- |
| [Canary](https://kanban-canary.giveit2.me/) | `a50358d` on `release/canary` | `4c1f1f7557066ddd` | `2026-11-05-canary-documents-and-guides` | `54911d5cedca` |
| [Stable](https://kanban.giveit2.me/) | `385a828` on `master` | `ea940dda1a4191bc` | `2026-11-05-stable-skill-reinstall` | `3adcbdb5a017` |

- Both projects use `pnpm build`, `apps/web/dist-browser`, Node 24 and pnpm 11.3.0. Production branches are `master` and `release/canary`; production channel settings are explicitly `stable` and `canary`. Stable retains its existing preview policy with `release/canary` excluded. Canary preview branch builds are disabled.
- The canary custom domain is Active with SSL enabled and points to `alpha-kanban-canary.pages.dev`. Existing stable DNS and manifest identity remain unchanged.
- Downloaded responses from both custom origins passed SHA-256 checks for every offline asset: 115 canary assets and 109 stable assets. The pinned JSON payload, every ZIP file, worker build, manifest identity, MIME/cache headers and direct SPA routes matched. The canary output also passed the repository's deployment-target checker. Chrome showed the matching build and offline readiness at each origin.
- Canary docs, configuration section links, release list and the deployed release detail opened at the public custom domain. Stable still serves its existing application routes; its new docs/releases pages have not been deployed. The stable skill bundle is byte-for-byte unchanged from the preceding stable release.
- Reinstall remains an explicit operation in Skill updates: register the dedicated folder, inspect changes, confirm replacement, then back up and apply the stable app's pinned bundle. Ordinary and PWA-bound updates retain their existing guards. Each origin retains its own backups; deployment does not replace anyone's installed skill.
- Local channel builds and the two 30-scenario PWA runs passed separately, including isolated Chrome restart, offline download, draft/write guards, update, restore, repair and retirement. These use OPFS and CDP installation, not native OS folder/install prompts. See [release and skill validation](release_skill_validation.md#2026-11-05-channel-release-verification-akc-0405) for the actual native-folder evidence and remaining checks.

The stable backport published sequence 3. Its exact logical record is retained in the canary branch's stable history, and the unpublished team-document records follow it as sequences 4–6. Before a future approved master promotion, retain that published record and review the dates and compatibility of the still-unpublished stable records. Rebuild for stable; do not copy canary output.

## Recovery and retirement

Follow [PWA operations and preservation](pwa_operations.md) for recovery builds, controlled updates, retirement, and incident drills. Retain the stable worker URL and user data. An emergency build replaces the normal build output; publish it only as part of the intended recovery procedure, then restore a verified normal release when appropriate.
