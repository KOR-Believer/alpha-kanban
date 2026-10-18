# Alpha Kanban

[한국어](README.md) · **English**

A kanban view of the plans and tickets you create with AI, right in your project folder.

[Open app](https://alpha-kanban.pages.dev/) · [Introduction and guide](https://alpha-kanban.pages.dev/intro)

Alpha Kanban is a web app for reading local Markdown plans, tickets, and inventories. Keep the conversation in your AI tool, and use the board to review documents and follow progress. When useful, update a ticket's status or leave an instruction directly in its Markdown file.

## Features

- **Connect projects:** Open one project or register a workspace containing several projects.
- **Browse documents:** Group plans, tickets, and inventories; search and sort documents; hide plain Markdown or completed document sets.
- **Project and all-project boards:** Focus on one ticket document or review tickets across connected projects.
- **Ticket details:** Read scope, acceptance criteria, user instructions, and progress notes. Switch between side, center, and full views, and resize the detail window.
- **Original Markdown:** Switch a ticket document from the board to its complete Markdown view.
- **Optional editing:** Save status, progress, and manual instructions to the original file. Review changes before confirming a drag-and-drop move.
- **Installation and offline access:** Install the PWA in its own window and, once offline preparation finishes, read and edit local documents without a connection.
- **Korean and English:** Korean is the default; select English in the top bar to switch. Document content and user-written text stay unchanged.

## Get Started

Use desktop Chrome over HTTPS or localhost. Using the app does not require Node.js or an account.

1. Choose **Open project** and select the folder you work in. You do not need to register its parent first.
2. To manage several projects, choose **Register workspace** and select their common parent folder. Its immediate subfolders appear as projects.
3. Open a project and select a document in the sidebar. Projects without plans, tickets, or inventories open the usage guide first. Plain Markdown remains available through an explicit sidebar selection.

For example, registering `workspace` in this layout adds `reading-journal` and `design-system` as projects:

```text
workspace/
  reading-journal/
    docs/
      01_reading_plan.md
      01_reading_tickets.md
  design-system/
```

**New project** creates a project folder inside a registered workspace.

Choose **Help → Take a quick tour** to explore the current screen's folder connections and board navigation. An invitation appears on your first visit; skip it or replay the tour from Help whenever you need it.

## What Is implementation-ledger?

[implementation-ledger](skills/implementation-ledger/SKILL.md) is a skill that helps your AI record **what you agreed to build, what has been implemented, and what still needs checking** in your project's Markdown files. A skill bundles reusable instructions and document templates; install it in Codex to use it while working.

- **Plans:** Describe goals, scope, key decisions, and questions that still need your input.
- **Tickets:** Divide implementation into reviewable tasks, each with acceptance criteria, status, progress, and verification results.
- **Inventories:** Keep research findings or reusable evidence in a separate document when the work needs one.

The skill does more than format documents. It distinguishes discussion, document writing, and implementation requests, and tells the AI to check unresolved questions that affect the current implementation. After implementation, it guides the AI to update tickets so you can review the results.

**The skill guides document creation and maintenance in your AI tool; Alpha Kanban lets you read those documents and follow progress.** Keep the conversation and development in Codex, and connect the same project folder to Alpha Kanban. Installing the web app and installing the skill are separate steps.

## Install the Skill

### Ask Codex to Install It

Send the request below to a Codex chat with access to your local files. **You do not need to clone Alpha Kanban, run the web app locally, or install `pnpm`.** Give Codex the skill's GitHub location. Installation needs an internet connection to retrieve the files.

```text
Use $skill-installer to install implementation-ledger from this GitHub path:

https://github.com/KOR-Believer/alpha-kanban/tree/master/skills/implementation-ledger

Install the entire folder, including SKILL.md, references, assets, scripts, and agents.
Check which personal skill location my Codex environment recognizes and use it.
If a skill with the same name is already installed, compare the files and explain the changes first.
Back up the existing installation and preserve personal edits. Ask me before overwriting it.
After installation, report the location and whether Codex recognizes the skill.
Do not change any project documents or code.
```

Codex's built-in `$skill-installer` can install skills from GitHub repositories. See the [official Codex skill guide](https://learn.chatgpt.com/docs/build-skills#install-curated-skills-for-local-use) for installation details.

In the web app, **Help → Create plans and tickets with AI → Review and copy install request** also provides a request you can send to Codex. Inside a project, installation guidance is available from the sidebar's **Usage guide**. The website provides the request; Codex performs the installation.

### Check the Installation and Start a Conversation

After installation, select `$implementation-ledger` in Codex and make a request. If the skill does not appear, reopen Codex and check again. You can start with a discussion that leaves your files unchanged:

```text
Use $implementation-ledger.
I want to build a reading journal app. Let's brainstorm features in discussion mode first.
Don't write documents or code yet.
```

If Codex cannot find the skill, ask it to check that `SKILL.md` is directly inside the installed skill folder and that its references and templates were installed too. To update, use the installation request above to compare the existing copy and review personal changes before replacing it.

## Work With AI

You can start before you have any documents. The important part is to read the AI's draft yourself, settle decisions that affect the implementation, and reflect those decisions in the documents before requesting code.

1. **Explore the idea.** “I want to build a reading journal app. Let's brainstorm in discussion mode. Don't write documents or code yet.”
2. **Request a plan and ticket draft.** “Use `$implementation-ledger` to draft a plan and tickets from our conversation. Separate agreed requirements from open questions.”
3. **Read the draft yourself.** Check the features, exclusions, and acceptance criteria against what you intended.
4. **Discuss relevant open questions.** Work through questions that affect this implementation with your AI. Questions about later work can remain open.
5. **Update the documents.** “Reflect our decisions in the plan and ticket scope and acceptance criteria. Resolve the answered questions, but don't implement yet.”
6. **Review the final documents.** Check that your answers made it into the actual files. Return to the conversation if anything remains unclear.
7. **Request implementation in order.** “Implement the reviewed tickets in dependency order. Verify the acceptance criteria and record the results in the documents.”

You can do all the work in your AI chat and use Alpha Kanban only for reading. Moving tickets and leaving instructions on the board are optional.

## Documents and Boards

Give related documents the same base name with these suffixes:

| File | Contents |
| --- | --- |
| `01_reading_plan.md` | Goals, scope, design, and open questions |
| `01_reading_tickets.md` | Ticket scope, status, acceptance criteria, and records |
| `01_reading_inventory.md` | Research findings and reference material |

You do not need all three files for every task. Use the documents that the work needs. Other `.md` files can also be read from the document list.

- **Project board:** Review the tickets in the selected document.
- **All tickets:** Search tickets across connected projects and filter by project.
- **Document filters:** Hide plain Markdown or sets whose tickets are all complete.
- **View preferences:** Sorting, filters, detail dimensions, and card order on the all-projects board are saved in the browser. They do not change document content.

See the [Markdown format reference](skills/implementation-ledger/references/ledger-format.md) and [sample tickets](examples/sample_tickets.md) for the document structure.

### Edit From the Board

Enable writing through **Local folders → Allow editing**.

- Status and progress changes are saved with a reason in the same Markdown file. Leaving the reason empty uses the default text displayed in the input.
- Dragging a card to another status opens a confirmation dialog. Canceling leaves the file and card unchanged; the card moves only after a successful save.
- The manual instruction input appends a record prefixed with `[수동지시]` (manual instruction) to the `사용자 지시` (user instructions) section.
- Reopening a completed ticket preserves its existing checklists and progress notes.
- After editing a document, ask your AI tool to reread the latest file. Saving in the board does not launch AI work.

If another tool changes the file, review the latest document before saving. Avoid editing the same file simultaneously in your AI tool and browser.

## Data and Permissions

Documents are read from the local folders you select. Confirmed edits are written to the original files. Alpha Kanban does not upload your project Markdown.

Folder connections, recent projects, view preferences, and save-recovery records are kept in this browser for this site address.

- Different domains, ports, and browser profiles have separate connections and settings.
- Clearing site data means reconnecting folders and configuring preferences again. It does not delete the original files on disk.
- **Disconnect folder** removes the app's connection, not the actual folder or documents.
- If access expires, use **Reconnect folder** to grant access again.
- If a save cannot be verified, open **Local folders → Recovery records** to inspect the original and intended copies. Check the actual file before submitting the same instruction again.

## Install the App and Work Offline

Open **App installation and updates** in the top bar and choose **Install app** when Chrome offers it. Installation opens Alpha Kanban in a separate window; it does not grant folder permissions.

After **Ready to use offline** appears, you can reopen the app and read or edit local documents without an internet connection. Download files in cloud-synced folders to your device first. External AI tools, GitHub links, and remote images need their own network access.

- **Check for updates:** Find and prepare new app files.
- **Apply update:** Switch versions after checking for unfinished inputs and saves. Save or discard unfinished changes in other app windows first.
- **Repair app:** Prepare app files again when the app is not working correctly. Folder connections, preferences, and document recovery records are preserved. Connect to the internet and close other app windows before proceeding. If the app will not open, visit `/repair.html` on the same site directly.

## Run Locally

Recommended development environment: Node.js 24 and pnpm 11.3.0. From the repository, run:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The default address is [http://127.0.0.1:5187](http://127.0.0.1:5187). If the port is occupied, use the address printed in your terminal.

To try installation, offline access, and updates, serve the built app:

```bash
pnpm build
pnpm preview
```

The default address is [http://127.0.0.1:4187](http://127.0.0.1:4187). Development mode does not register a service worker. The two addresses use different ports, so each keeps its own connections and settings.

### Static Hosting

Use these settings on Cloudflare Pages:

| Setting | Value |
| --- | --- |
| Build command | `pnpm build` |
| Output directory | `apps/web/dist-browser` |

Serve over HTTPS with SPA routing for `/`, `/intro`, `/all`, and `/w/:id`. Cloudflare Pages provides its [default SPA handling](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering) when the output root has no `404.html`. Deploy the generated service worker, repair files, and `_headers` with the app.

Use a stable site address for installation and folder connections. See the [PWA operations guide](docs/pwa_operations.md) for service-worker updates, recovery, and retirement.

### Checks

```bash
pnpm --filter @alpha-kanban/web typecheck
pnpm --filter @alpha-kanban/shared test
pnpm --filter @alpha-kanban/web test
pnpm build
```

Browser checks use Chrome:

```bash
# With the development app running on port 5187
pnpm test:tours

# Installation, offline access, updates, and recovery in isolated Chrome profiles
pnpm test:pwa
```

[한국어 README](README.md)
