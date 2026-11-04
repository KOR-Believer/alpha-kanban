# Contributing to Alpha Kanban

This guide is for contributors changing the skill or web app. To use the skill and hosted viewer, start with the [README](README.en.md) ([한국어](README.md)). Hosting instructions for the project operator are in [Deployment](docs/deployment.md).

## Local development

Clone this repository and open its root directory. Use Node.js 24 and the pnpm version pinned in `package.json` (currently 11.3.0).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The default development URL is [http://127.0.0.1:5187](http://127.0.0.1:5187). If the port is occupied, check the URL printed by the command. Development mode does not register a service worker.

The web app runs entirely in the browser. Node.js is used for development and building; no application API server is needed.

## Build and preview

```sh
pnpm build
pnpm preview
```

The build output is `apps/web/dist-browser`. Preview defaults to [http://127.0.0.1:4187](http://127.0.0.1:4187) and supports production PWA behavior. Development and preview have different origins, so their folder connections and settings are separate. Use a dedicated browser profile and test folder for changes involving local writes, updates, or recovery.

The `dev:browser`, `build:browser`, and `preview:browser` commands are aliases for these commands.

`AK_RELEASE_CHANNEL=stable|canary` selects a build channel; omitting it preserves the stable default. Use separate checkouts and preview origins for channel comparisons. Each checkout still emits `apps/web/dist-browser`; do not run opposing channel builds concurrently in one checkout or reuse an already connected browser origin for the other channel.

```sh
pnpm test:channels
pnpm test:channel-builds
```

The first command checks channel selection and deployment guards. The second captures the current source, including uncommitted work, and packages/builds it in two isolated directories under ignored `output/`. It reuses installed dependencies without changing local development assets or creating deployment branches. The report compares release histories, app identities, repair metadata, offline integrity and skill contents, and rejects the opposite deployment target. These local results do not establish public hosting or native PWA installation behavior.

## Validate changes

Run checks appropriate to the changed behavior:

```sh
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test:ledger` exercises the bundled read-only context tool in disposable directories and native Git worktrees, including configuration precedence, ownership headers, numbering and a copied installation without project dependencies. It also runs as part of `pnpm test`. Tests pass an isolated home to the tool; they do not modify personal settings or installed skills. The shared-package tests verify that normal Markdown writes preserve the Owner header, BOM, line endings and other tickets. Real agent document-creation checks are separate from these automated tests.

`pnpm test:documents` runs the repository-local document CLI in disposable Git worktrees, including reference analysis, reviewed moves and ownership changes, PC path rebasing, native backups, interruption and explicit recovery. It runs as part of `pnpm test`. See the [document CLI contract](docs/document_cli.md) for JSON requests, exit codes, scope and recovery. These tests never move the contributor's documents or install the CLI into a personal skill. `pnpm build:document-cli` rebuilds the self-contained installed CLI and dependency licenses; `node scripts/build-document-cli.mjs --check` verifies reproducibility. `pnpm test:skill-distribution` checks JSON/ZIP/installed hashes, provenance, installation failure preservation and the copied CLI outside the source repository. The installed runtime needs Node.js 24 and Git, with no pnpm or node_modules.

For browser flows, use desktop Chrome:

`pnpm test:maintenance-worker` checks the development decoder resolution and executes the built document-analysis Worker without a DOM. It runs as part of `pnpm test`. The [maintenance performance report](docs/document_maintenance_performance.md) describes the native-folder benchmark, the synthetic fixture generator, and the distinction between preview speed and guarded saving.

The [local link connection guide](docs/browser_link_connections.md) describes read-only link mapping and its boundaries. `pnpm --filter @alpha-kanban/web test src/browser/linkMappings.test.ts src/browser/LocalLinkDialog.test.tsx` checks path/repo resolution and the connection UI. For an isolated A/B report, set `AKD10_AB_REPORT` to an ignored output JSON path when running `linkMappings.test.ts`. The report uses fake handles, separate experiment storage/cache namespaces, and first-use/reuse measurements; it is not a native filesystem benchmark. Use disposable native folders for Chrome picker, permission, restart and persistence checks.

Prepare a portable native smoke kit in a new empty directory:

```sh
node scripts/prepare-link-smoke.mjs --out output/link-smoke --build
node scripts/package-link-smoke.mjs output/link-smoke output/link-smoke.zip
```

The kit includes two prebuilt PWA releases, fictional colleague-PC paths, nested repositories/forks/checkouts, read-only native A/B and boundary pages, a freshly rebuilt standalone document CLI and a hash verifier. Its README covers isolated Chrome profiles and Windows execution using Node.js 24 and Git, without pnpm or a source checkout. Packaging includes only the named assets and fixtures; it excludes browser profiles, logs and CLI journals. `node native-cli.mjs` creates fresh disposable Git worktrees and writes `native-cli-<platform>.json`; its ten cases include deliberate process interruption followed by explicit unlock/resume and unlock/recover using a smoke-only worker. `node verify.mjs` checks all 32 protected fixture files. `RETEST.md` narrows follow-up Windows checks to the CLI, target candidate labels, unsaved connection inputs across language/theme changes and individual folder revocation. Native A/B uses real directory-picker handles and its own IndexedDB. The boundary page calls production services with native handles to check inaccessible Git metadata and incomplete discovery; it is separate from app UI interaction. `pnpm test:pwa` checks saved-link persistence across updates and a complete offline browser restart with OPFS. Record these as different kinds of evidence. Never clear site data or revoke folder access in the contributor's existing profile.

```sh
# With the development app running on port 5187:
pnpm test:tours

# Builds test releases and uses an isolated Chrome profile:
pnpm test:pwa
```

PWA smoke tests cover installation, offline operation, updates, recovery, and retirement with test filesystem handles. They do not establish native OS folder permissions or deployed hosting behavior. See [PWA operations](docs/pwa_operations.md) for preservation requirements and recovery build commands.

## Release and skill changes

Add end-user changes in Korean and English to `apps/web/releases.json` for stable or `apps/web/releases.canary.json` for canary. Records use a stable logical `id`, increasing `sequence`, ISO `date`, `notify`, and `notes.ko`/`notes.en`. Preserve published records. Rebuilding a release keeps its ID; a later public change gets a new record. Use `notify: false` for changes that should remain in manual history without an automatic notice; keep development-process notes out of both files. Local records are not evidence of deployment.

Builds validate this history and embed the same current notes in the page, worker and `release.json`. Applying an update binds to the prepared worker, not a more recent network response. Test that distinction whenever the update protocol changes.

Skill packaging creates the complete ZIP and a JSON payload with per-file hashes and a build-pinned payload SHA-256. `scripts/skill-releases.json` lists known official snapshots by full commit and every file hash. Add a snapshot only after comparing that commit's complete skill tree and confirming the intended upgrade; do not add personal installations to this allowlist. Content hashes are not semantic skill or document-format versions.

The browser supports confirmed updates of existing known installations, not first installation. Keep custom files untouched, persist a full backup before writes, and exercise explicit recovery after partial failure. `pnpm install:skill` refuses existing destinations. Use `node scripts/install-implementation-ledger-skill.mjs --inspect --target <dedicated-directory>` for read-only comparison, and omit `--inspect` only for an authorized fresh install. Receipts live outside the skill tree and retain full commit, worktree/commit provenance, compatibility and file hashes. Installer tests use explicit disposable `--target` directories; never point tests at a personal installation.

See [release and skill validation](docs/release_skill_validation.md) for completed automated checks and the native-folder/Codex gates that remain before merging or publishing this feature.

For ticket document changes, inspect the affected ticket and validate the document:

```sh
pnpm ticket-md show docs/example_tickets.md EX-01
pnpm ticket-md check docs/example_tickets.md
node skills/implementation-ledger/scripts/check-ledger.mjs docs/example_tickets.md
```

Replace the example path and ID with the actual document and ticket. Use the [ledger format](skills/implementation-ledger/references/ledger-format.md) for canonical structure and legacy validation rules.

## Contribution scope

- Read [AGENTS.md](AGENTS.md) for repository conventions and data-preservation requirements.
- Keep changes to the bundled skill under `skills/implementation-ledger/`. Updating the repository must not overwrite a contributor's personal skill installation.
- Keep `/` as the PWA workspace and `/about` as the introduction and installation guide. Web builds and installed personal skills have separate update paths.
- Write public guidance for users: skill installation and usage first, optional hosted viewer second. Use `https://kanban.giveit2.me` for public app links.
- Keep development commands here and deployment procedures in the operator guide. Use repository-relative paths or generic examples. Do not commit personal machine paths, private project names, design-session identifiers, or temporary preview/capture links.
- Keep useful decisions and verification results in project records. Omit tool diaries and temporary process state. Report the checks actually run and their limits; documentation-only changes generally need link and format checks, not the full application suite.
