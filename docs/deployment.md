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

Local previews establish application behavior, not production DNS, edge routing, headers, or OS installation behavior. Record deployment checks separately from local test results.

## Recovery and retirement

Follow [PWA operations and preservation](pwa_operations.md) for recovery builds, controlled updates, retirement, and incident drills. Retain the stable worker URL and user data. An emergency build replaces the normal build output; publish it only as part of the intended recovery procedure, then restore a verified normal release when appropriate.
