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

## Validate changes

Run checks appropriate to the changed behavior:

```sh
pnpm typecheck
pnpm test
pnpm build
```

For browser flows, use desktop Chrome:

```sh
# With the development app running on port 5187:
pnpm test:tours

# Builds test releases and uses an isolated Chrome profile:
pnpm test:pwa
```

PWA smoke tests cover installation, offline operation, updates, recovery, and retirement with test filesystem handles. They do not establish native OS folder permissions or deployed hosting behavior. See [PWA operations](docs/pwa_operations.md) for preservation requirements and recovery build commands.

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
- Keep `/` as the PWA workspace and `/intro` as the introduction and installation guide. Web builds and installed personal skills have separate update paths.
- Write public guidance for users: skill installation and usage first, optional hosted viewer second. Use `https://kanban.giveit2.me` for public app links.
- Keep development commands here and deployment procedures in the operator guide. Use repository-relative paths or generic examples. Do not commit personal machine paths, private project names, design-session identifiers, or temporary preview/capture links.
- Keep useful decisions and verification results in project records. Omit tool diaries and temporary process state. Report the checks actually run and their limits; documentation-only changes generally need link and format checks, not the full application suite.
