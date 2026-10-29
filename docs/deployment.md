# Deployment

This guide is for the project owner or an authorized maintainer operating the hosted app. Skill users can install from the official repository and use [the hosted viewer](https://kanban.giveit2.me/) without building or deploying anything. See [Contributing](../CONTRIBUTING.md) for local setup.

## Production identity

- Public origin: `https://kanban.giveit2.me`.
- `/`: project workspace and PWA entry point.
- `/intro`: introduction and skill installation guide.
- `/sw.js`: stable service worker URL. Manifest `id`, `start_url`, and `scope` remain `/`.

Keep this origin and PWA identity stable across releases. Folder handles and settings are stored per origin and browser profile; changing the address does not migrate them. The local Markdown files remain on disk.

## Cloudflare Pages configuration

Use the operator's existing Pages project and custom-domain settings. Account access, deployment credentials, and DNS administration belong in the hosting service or an approved secret store, not this repository.

| Setting | Value |
| --- | --- |
| Build command | `pnpm build` |
| Output directory | `apps/web/dist-browser` |
| Public custom domain | `kanban.giveit2.me` |

Use the Node.js and pnpm versions documented in [Contributing](../CONTRIBUTING.md), and install dependencies from the lockfile before building. Publish the complete output, including the generated service worker, repair files, skill archive, fonts, and `_headers`.

Serve the app over HTTPS with SPA routing for `/`, `/intro`, `/all`, and `/w/:id`. Cloudflare Pages provides [default SPA handling](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering) when the output root has no `404.html`. Verify actual responses after deployment: worker scripts, release metadata, repair assets, and missing static assets must not be mistaken for the app's HTML shell.

## Release checks

1. Run the relevant application checks and build a complete release. For PWA lifecycle changes, run the isolated smoke tests before publishing.
2. Verify HTTPS, MIME types, cache/CSP headers, direct entry and refresh on the application routes, and the generated repair resources at the production origin.
3. Verify installation and offline readiness in desktop Chrome. Test an update with multiple windows, drafts, and a dedicated local test folder; confirm connections, preferences, and recovery records survive.
4. Check that the skill installation guide points to the intended official source. A web deployment does not update users' installed personal skills.

## Release records

- Before authorizing a release, review `apps/web/releases.json`: bilingual user-facing notes, stable logical ID, increasing sequence, actual release date and automatic-notice policy. Do not rewrite published records to describe a different release. The pending local record is not a deployment receipt.
- `pnpm build` validates history and produces matching `release.json`, compiled notes and worker information. Publish the complete output together. Preserve no-store handling for `/release.json` and `/sw.js`; do not introduce a second-origin notes endpoint.
- Ship the versioned skill JSON, payload digest and complete ZIP together. The browser compares against its own build's pinned payload, not mutable GitHub master. Distinguish changes to skill rules from changes to installation or update management; unknown compatibility must route to agent review, not direct replacement. Meaningful skill/format version policy remains a separate tracked contract.
- Before enabling confirmed skill updates for users, review the native-folder, link/attribute and isolated-Codex results in [release and skill validation](release_skill_validation.md). Record any explicit owner-approved handoff of remaining checks without marking them passed. Passing OPFS tests alone is not release approval.
- Verify the notes for the actual waiting build before applying it, then the one-time project-selector modal and manual history. Preserve folder connections, preferences, release-read markers, skill connections and recovery journals through update, repair and retirement. Browser updates never imply approval to replace a user's skill.

Local previews establish application behavior, not production DNS, edge routing, headers, or OS installation behavior. Record deployment checks separately from local test results.

## Recovery and retirement

Follow [PWA operations and preservation](pwa_operations.md) for recovery builds, controlled updates, retirement, and incident drills. Retain the stable worker URL and user data. An emergency build replaces the normal build output; publish it only as part of the intended recovery procedure, then restore a verified normal release when appropriate.
