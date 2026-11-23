# Document fixtures, evidence and disposable output

Resolve the owning Markdown record before writing attachments. When a new record was requested, create it using its own document context first. Pass the saved record to the bundled helper from its current project or worktree. The command only reads settings and files. Its directory results are relative to the reported project root. Use them as the base for the generator, test tool and browser profile you start.

```sh
node <skill-directory>/scripts/document-context.mjs artifacts --cwd <project> --target <record.md>
```

## Derive the location

- **Document root** comes from the shared `[documents] root` setting and defaults to `docs`. **Document folder** is the actual parent of the selected Markdown file. It may be the root itself, an owner folder, or an existing subject folder. Respect its exact spelling, depth and nearest owner. Use the existing set's directory; an agent must not create a new owner or subject directory to organize attachments.
- **Slug** is the same key Alpha Kanban uses for the set. From the filename, strip the final `.md`, one leading sequence of digits followed by `_`, and one terminal `_smoke_run`, `_smoke`, `_tickets`, `_plan` or `_inventory`. Preserve everything between them, including case, hyphens and underscores. For example, `140_settlement_qa_plan.md`, `141_settlement_qa_smoke.md` and `142_settlement_qa_smoke_run.md` share `settlement_qa`. A standalone smoke document follows the same rule.
- **Run stem** is the entire run filename with only the final `.md` removed, including its document number. **Document-ID** is the selected document's own UUID. For a run, use its UUID, not the definition's `Smoke-Document-ID`, TC number or displayed run number.

| Contents | Exact project-relative directory | Git |
| --- | --- | --- |
| Fixture generators, small sanitized seeds, or exact bytes required to reproduce a case | `<document folder>/assets/<slug>/fixtures/` | Track |
| Durable material shared by the set, such as an annotated reference image or a reviewed sample | `<document folder>/assets/<slug>/references/` | Track |
| Evidence retained for one execution, such as the single capture that explains a failure | `<run document folder>/assets/<slug>/runs/<run stem>/` | Track |
| Regenerable files, temporary builds, logs, test profiles, intermediate captures | `<project root>/.output/alpha-kanban/<slug>/<Document-ID>/` | Ignore |

Create only the applicable directories. Put author-created files directly inside the selected category. If a fixture tests a particular directory structure, reproduce that tree inside `fixtures/`; direct any generated tree to `output` from the helper. Do not use a different top-level folder, substitute an English translation of the title, or create the numbered document as another folder. When a reusable generator or authoritative spec already belongs to the project, link to that source in place.

For a root of `contexts`, a run at `contexts/@alice/billing/142_settlement_qa_smoke_run.md` owns the following paths. In basic mode, a run at `docs/142_settlement_qa_smoke_run.md` gets the same relative attachment links beside that document and the same project-level output convention.

```text
contexts/@alice/billing/assets/settlement_qa/fixtures/make-upload.mjs
contexts/@alice/billing/assets/settlement_qa/references/upload-rules.png
contexts/@alice/billing/assets/settlement_qa/runs/142_settlement_qa_smoke_run/rejected.png
.output/alpha-kanban/settlement_qa/22222222-2222-4222-8222-222222222222/oversize.bin
```

If the selected document is outside the configured root, the root overlaps `.output/`, the slug is unsafe, or the path traverses a symlink, report the condition. A legacy record without a valid Document-ID can still use its attachment directories. Its output path is unavailable until identity is deliberately resolved through document maintenance. If a duplicate ID is known, resolve it before sharing scratch. Do not issue an ID during an ordinary edit, choose another directory, or rewrite old evidence paths to make them match this convention. Attachments can serve multiple documents; moving a single record does not authorize moving the set's shared inputs.

## Decide what to keep before closing a run

1. For an input that tests size alone, keep the generator and parameters. A 10 MiB + 1 KiB case needs exactly 10,486,784 bytes. Generate that file in the run's output directory; record the size, command and seed when applicable in the definition's memo or TC prerequisites. Small sanitized input whose exact contents matter can be checked in. For a large indispensable original, link to a versioned artifact with its checksum.
2. In the run log, describe what was observed. Link a selected, shareable exhibit relative to the run Markdown, for example `[Rejected upload](assets/settlement_qa/runs/142_settlement_qa_smoke_run/rejected.png)`. A durable Markdown link must still work after scratch cleanup. If a failure is not reproducible, preserve what explains it before ending the run. Keep secrets, real customer data and personal profiles out of fixtures and evidence.
3. Use `/.output/` in the repository-root `.gitignore`; the same entry covers every owner, subject and run. The helper's `outputIgnore` field reports whether a rule in that shared file covers the directory. If it returns `rule-needed`, add the shared rule before generating scratch and run the check again. In a project without Git it returns `no-git`. Leave `assets/` eligible for Git. If a pre-existing ignore pattern hides a needed attachment, check its exact path with `git check-ignore -v -- <path>` and narrow the rule. Capture the generator/evidence together with the Markdown that points to it when committing the work. Git ignore does not untrack files already committed.
4. At the end of the run, preserve its evidence and handoffs, stop your own browser or server, and clear the scratch files you created once their consumers have finished. Only clear a whole run directory if you own all its contents and it is idle. When no runs or consumers are active, the whole `.output/alpha-kanban/` subtree is disposable without reviewing filenames. A file awaiting a human or another machine must already have a durable or agreed delivery location, or be reproducible from the committed recipe. A pending handoff must not depend on the only copy in scratch. Cleanup applies only to this namespace, never a sibling tool's files, an active profile or historical output stored elsewhere.
