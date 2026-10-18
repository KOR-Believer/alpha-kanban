# Alpha Kanban

[한국어](README.md) · **English**

**Keep a project record of what you agree with AI, implement, and verify.**

The core is the [implementation-ledger skill](skills/implementation-ledger/SKILL.md). It helps AI record scope, acceptance criteria, progress, and verification in local Markdown so you can review the work and take part in decisions. The skill supports the workflow from planning through implementation on its own. The web app is an optional viewer for those same documents and their progress.

[Introduction and installation](https://kanban.giveit2.me/intro) · [Open web viewer](https://kanban.giveit2.me/)

## 1. Install the skill

Send this request to a **Codex chat** that can work with your local project files. You do not need to download this repository or run the web app locally. Installation requires access to GitHub.

```text
Use $skill-installer to install implementation-ledger from this GitHub path:

https://github.com/KOR-Believer/alpha-kanban/tree/master/skills/implementation-ledger

Install the entire folder, including references, assets, scripts, and agents, not only SKILL.md.
Find and use the personal skill location recognized by my Codex environment.
If a skill with the same name is already installed, compare it and explain the changes first.
Back up the existing installation and preserve my customizations. Ask before overwriting it.
Report the installation location and whether Codex recognizes it. Do not change project documents or code.
```

After installation, check that you can select `$implementation-ledger`. If it does not appear, reopen Codex and ask it to check that `SKILL.md`, references, and templates were installed together.

The [skill guide on the website](https://kanban.giveit2.me/intro#skill) also provides the installation request. The website provides guidance; Codex performs the installation.

## 2. Work with AI

Start by discussing what you want to build.

```text
Use $implementation-ledger.
I want to build a reading journal app. Let's discuss the features and scope first.
Do not write documents or code yet.
```

Once you have a direction, ask for a work record.

```text
Use $implementation-ledger to draft tickets from what we have agreed.
Add a plan if multiple tickets need shared design decisions.
Separate scope and acceptance criteria from questions I need to answer or decide.
Do not implement yet.
```

Read the draft and check the features, exclusions, and acceptance criteria. Discuss questions that affect the current implementation, have AI update the documents with your decisions, then request development.

```text
Implement the reviewed tickets in dependency order.
First read the latest user directions and relevant open questions.
Verify the acceptance criteria and record the results and remaining work in the tickets.
```

You can return to the same files to continue later. Document creation and implementation are separate requests, leaving room to review and adjust the scope.

### What gets recorded?

| Example document | Purpose |
| --- | --- |
| `01_reading_tickets.md` | Scope, acceptance criteria, status, progress, user directions, and verification results |
| `01_reading_plan.md` | Goals, design, and decisions shared by several tasks |
| `01_reading_inventory.md` | Research and evidence worth referring to again |

Usually start with tickets; add a plan or inventory when needed. Related documents share a common filename prefix. See the [document format](skills/implementation-ledger/references/ledger-format.md) and [sample tickets](examples/sample_tickets.md).

## 3. Update the skill

Return to the [installation guide](https://kanban.giveit2.me/intro#skill) to find the official skill source. Use the installation request above to compare it with your existing copy. Review the changes, then update with a backup and your customizations preserved.

**Web app updates and personal skill updates are separate.** Reopening the website or updating its PWA does not update your installed skill. Ask Codex to check the location and contents of your installation.

## Optional: view documents and progress on the web

Open the [web viewer](https://kanban.giveit2.me/) in desktop Chrome and choose **Open project** to connect the folder you use with AI. No account or local web server is required.

- **Project board:** Read ticket status, scope, acceptance criteria, and progress notes.
- **All tickets:** Review work across connected projects. You can register their shared parent folder as a workspace.
- **Document views:** Read, search, and sort plans, tickets, inventories, and ordinary Markdown.
- **Optional editing:** Grant write access to save status, progress, reasons, and manual directions to the original Markdown. Dragging a ticket also requires save confirmation.

You can keep all conversation and development in your AI chat and use the web app only for reading. After leaving a direction on the board, ask AI to reread the latest file. Saving does not run AI. Avoid editing the same file in AI and the browser at the same time.

For guidance, use **Help → Take a quick tour** or **Create plans and tickets with AI** in the app.

### Local data and PWA

Documents are read from the local folder you choose; confirmed edits are saved to the original files. Alpha Kanban does not upload project Markdown. Folder connections, view preferences, and save-recovery records belong to that browser and site origin.

- Disconnecting a folder does not delete its files. Reconnect it if permission expires.
- A different address or browser profile needs its own connections and settings. Clearing site data also removes saved connections, settings, and recovery records.
- If a save result is uncertain, inspect **Local folders → Recovery records** and the actual file before saving again.
- Use **App installation and updates** to install the PWA. Once **Ready to use offline** appears, you can read and edit local files already downloaded to your device offline. External AI tools and GitHub need their own connections.
- Before an app update, save or discard drafts in all app windows. If the app will not open, use [app repair](https://kanban.giveit2.me/repair.html) while online.

`/` is the project workspace; `/intro` is the introduction and installation guide. The PWA also starts at `/`.

## Contributing

For local development, builds, and validation of the skill and web app, see the [contribution guide](CONTRIBUTING.md).
