# Versions and document compatibility

## Sources of truth

`scripts/lib/ledger-contract.mjs` declares skill revision **2**, readable/writable document formats **unversioned and 1**, and the new-document default **unversioned**. SKILL.md metadata and packaged manifest must agree with it. Revision 1 is the first declared revision, not a version retroactively assigned to older bundles. No previous semantic versions are inferred from bundle hashes.

| Identifier | Meaning |
| --- | --- |
| Skill revision | Monotonically increasing integer for changed instructions, templates or helpers. Does not imply a document migration. |
| `Ledger-Format: 1` | Optional document grammar declaration. Format 1 describes the existing plan/tickets/inventory grammar, including optional metadata. |
| Bundle hash / payload SHA-256 | Exact installed file bytes and verified download. A revision alone never proves an official or unmodified installation. |
| App release / build | Viewer delivery and assets. Does not substitute for document format or skill revision. |
| `Document-ID` / local `d_` / ticket ID | File identity / browser-local handle identity / ticket identifier; separate from all version numbers. |

Keep basic templates unversioned. A document does not need a format declaration, Owner, UUID or settings to be created or edited. Do not insert version fields into existing documents during ordinary edits or an app/skill update.

## Header and support decisions

The optional `Ledger-Format: 1` line uses the same header boundary as Owner: after the initial H1 (following any complete existing front matter), in the contiguous field/blank-line header. Stop at prose, a list, a comment, a fence or another heading. Only the exact field spelling, a single occurrence and a positive decimal integer without leading zeros are valid. Case variants, empty/noninteger values and duplicates are invalid, not unversioned. Front matter, examples and ticket bodies are not this header and remain opaque.

Rendering is strictly backward compatible and independent of compatibility inspection. The display parser does not call the inspector or expose its flags to the UI. Keep its existing fallbacks (unrecognized status displays as TODO; progress outside the supported steps displays as 0), without rewriting the source. Missing fields, format declarations, malformed metadata and cleanup candidates must not hide parsed cards, counts, board controls or details on either board. Markdown view remains a user choice.

Compatibility analysis supports explicit maintenance: adding selected missing metadata such as Document-ID/Owner and removing selected obsolete sections. It is never a prerequisite for viewing. Ordinary writes retain their separate structural and file-safety checks; declining an unsafe write does not change what can be read.

| Input | Display / ordinary structural write |
| --- | --- |
| Undeclared, recognized legacy structure | Display with the existing parser; edit in place while preserving legacy sections and unknown fields. |
| `Ledger-Format: 1`, recognized structure | Same grammar; preserve the declaration. |
| Positive unsupported format | Display whatever the existing parser extracts; structural writes are refused without guessing or downgrading. |
| Missing descriptive fields/summary or mixed LF/CRLF | Display with the existing parser. Structural write checks remain independent; opening the document performs no repair. |
| Malformed/duplicate declaration, unclosed front matter, ambiguous ticket boundaries or unknown state/progress | Retain the parser's existing extraction/fallbacks. Refuse unsafe structural writes; never use that refusal to hide parsed content. |
| Valid extra fields, Owner or Document-ID | Preserve them byte-for-byte during ordinary ticket edits. Their presence does not authorize migration or reassignment. |

Unsupported/invalid format checks apply to the shared writer and the standalone ticket-md/check-ledger tools, including `--legacy` and dry runs. Inspector `readable`/`writable` flags describe support for those structural tools, not viewer eligibility. Existing stale-file, locking and recovery guards still apply. Ordinary mutation preserves BOM, LF/CRLF, the final newline and every non-target area; mixed line endings are refused rather than normalized.

## Updating the skill

Check [the official update guide](https://kanban.giveit2.me/intro#updates) only on an installation/update request or a compatibility problem. Offline or failed lookup means **latest version unverified**, not current or compatible. Compare exact files and provenance, back up and preserve personal changes, and obtain the user's applicable overwrite approval. Do not replace global installations as part of project implementation.

Instruction-only fixes increment the skill revision without changing document format. Compatible optional fields can stay within format 1 if older readers preserve their semantics and bytes. Required new structure or changed state/field meaning needs a new document format and explicit read/write support tests; do not silently widen the supported range. Unknown versions remain unsupported even if a numeric comparison says they are older.

A release record identifies its revision, supported read/write formats, new-document default, change reason, affected prior revisions, recommendation versus compatibility requirement, migration requirement and official source. Distribution adds the exact Git commit/source, bundle hash and payload SHA-256. A local draft is not a published release, and these declarations do not authorize automatic replacement of an installed skill.

| Revision | Change / affected earlier installations | Recommendation / document migration |
| --- | --- | --- |
| 2 (local, not yet published) | Optional ID assignment, legacy Progress Board cleanup, standalone guarded document CLI and explicit installation provenance. Affects revisions 1 and undeclared installations only when these capabilities are wanted. | Recommended for these optional operations; no document migration required by an update. |
| 1 (local, not yet published) | First explicit contract; preserves undeclared legacy documents and optional Owner. Previous undeclared bundles have unknown capabilities until compared. Adds shared format guards and read-only identity analysis. | Use when format checks/identity analysis are needed; no automatic document migration. Installation replacement still requires separate verification and consent. |

## Optional identity analysis

`scripts/lib/document-metadata.mjs` exposes pure `readDocumentMetadata`, `analyzeDocumentMetadata`, `previewDocumentMetadata`, `resumeMetadataPreview` and `indexDocumentIds`. They perform no filesystem discovery or writes. Call a preview only for an explicitly selected project-relative Markdown path and operation: `assignId`, `clone` or `reconcileOwner`. Ordinary Markdown also needs `allowPlainMarkdown: true`.

`Document-ID: <UUID v4>` is optional in the Owner header. Preserve existing valid IDs; only an explicit clone receives a replacement. Invalid/duplicate fields and unsupported formats are refused. UUID assignment does not also add Owner, a format declaration, title or dates. Owner reconciliation records the current valid `docs/@name` path; it cannot establish past paths, safe links or permission to implement a ticket.

A preview returns the source, intended text, generated ID and exact edits. Keep that same preview for resumption: `resumeMetadataPreview(preview, currentMarkdown, currentPath)` accepts only the original or already-intended bytes at that path. It returns text, not an applied result or a safe-file transaction. Changed input needs new analysis. Index UUIDs by project; duplicate local files remain a collision, and another checkout is not an automatic match. For explicitly requested ID assignment or legacy cleanup, use the guarded `migrate` command in [document operations](document-operations.md); it uses the same shared transformation as browser previews. Owner reconciliation is a separate explicit CLI operation. Do not apply a raw pure preview by directly overwriting a file.

## Exact installation provenance

The packaged JSON and manifest carry the full source commit, repository URL, `source.kind` (`commit` or modified `worktree`), declared ledger contract and every file SHA-256. The ZIP contains the same skill files; its digest is in the manifest. A worktree build is not the bytes at the linked commit and neither kind alone proves publication. Use the app-pinned payload hash or a deliberately selected full commit as the source; a mutable branch or revision number alone is insufficient. Existing reviewed snapshots remain in the release registry without inventing new published history.

The repository installer offers read-only `--inspect --target <dedicated-directory>` and fresh installation only. It refuses every existing target, including matching, custom, unversioned and incomplete folders. It stages and verifies the complete bundle, publishes SKILL.md last without overwriting a raced target, then writes a receipt outside the skill folder so installed hashes remain comparable. A failure retains prepared files and a receipt for explicit comparison/recovery; do not call a partial target installed or delete it blindly. Registered official installations use the existing confirmed browser backup/update/restore workflow; unknown or modified installations require agent comparison. No new initial-install browser engine is provided.
