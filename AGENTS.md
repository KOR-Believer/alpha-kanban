# Agent Notes

## Browser Smoke

- Prefer the Chrome plugin first for visual smoke checks, layout review, and cursor/mouse feedback.
- Use the in-app browser only when Chrome is unavailable, blocked, or the task specifically targets the Codex in-app browser.
- Use Playwright CLI when a repeatable browser flow, DOM assertion, or scripted interaction is needed.
- Keep Playwright snapshots short. Avoid dumping large accessibility snapshots when the page has long project or ticket lists.
- For visual-only checks, use a screenshot or browser inspection summary instead of raw snapshot output.

## Implementation Ledger Markdown

- Use the bundled `skills/implementation-ledger` skill as the operating protocol for creating or updating plan, ticket, and inventory documents.
- Prefer the repo-local `pnpm ticket-md` helper when changing ticket status, progress, `Completed at`, `사용자 지시`, or `진행 메모`.
- Use `pnpm ticket-md show <file> <ticket-id>` before editing an existing ticket so the exact ticket range is known.
- Use `pnpm ticket-md status`, `pnpm ticket-md append-user`, and `pnpm ticket-md append-note` for canonical ticket mutations. These commands update only the located ticket body and top-level `현재 진행률`.
- Run `pnpm ticket-md check <file>` after ticket document edits.
- Run `node skills/implementation-ledger/scripts/check-ledger.mjs <file>` when creating a new canonical ticket document or validating strict Alpha Kanban compatibility.
- Manual `apply_patch` edits are acceptable for non-canonical prose or checkbox changes, but keep them inside the inspected ticket range and re-run `pnpm ticket-md check`.
- Do not resurrect legacy Progress Board sections. Ticket body fields are the canonical source of truth.

## Document-First Workflow

- In-app chat and Codex run entry points are temporarily hidden by `apps/web/src/features.ts`. Keep existing runner APIs and stored chat/run history intact; do not re-enable entry points without a product decision.
- The visible UI edits Markdown, not agent sessions. Ticket directions and status-change reasons append to `사용자 지시`; saving them must not launch Codex or write agent-authored `진행 메모`.
- Keep status/progress/completion-time/count changes and their reason in one guarded file update. Preserve previous checklist evidence and notes on reopen, and retain stale-file protection.
- Status changes with an empty reason use the shared user-authored default message. Free text uses `[수동지시]`; do not restore the record-type selector. Drag/drop requests confirmation and saves before moving a card, using the same status form and captured file guard.
- Interpret structured user records using the bundled skill's `references/ledger-format.md`. For an assigned ticket, read the latest directions instead of assuming an earlier DONE result still applies.
- Update the bundled skill for this workflow; do not overwrite the user's separately installed skill as part of application changes.

## Product UI Design

- `DESIGN-notion.md` was deprecated and removed from this project. Do not recreate it or use it as the design-system source.
- Use the shadcn b1 preset foundation imported into `apps/web/src/styles.css`: Raleway variable font, OKLCH semantic tokens, olive/acid primary, rounded compact controls, hairline borders, and restrained shadows.
- Treat `styles.css` semantic variables (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, etc.) and the mapped `--ak-*` aliases as the single source of truth. Do not introduce a second color/radius/spacing system.
- Use the local `apps/web/src/components/ui/*` wrappers for buttons, badges, dialogs, popovers, selects, and checkboxes. Update those wrappers instead of scattering one-off Tailwind styling when common control styling is wrong.
- Use `DialogHeader`, `DialogBody`, and `DialogFooter` for aligned modal sections, and the shared `Textarea` wrapper for document inputs. Ticket detail and move dialogs share `TicketStatusFields` rather than separate form styling.
- Use the shared `Input` wrapper for new single-line inputs; it inherits `ak-control-field` instead of introducing another input theme.
- Use a stable internal-scroll model for app shells. Scrollable regions should use the shared `ak-scroll-area` styling so scrollbar gutters, thumb weight, and edge alignment stay consistent.
- The all-projects board uses `ak-all-board-toolbar`, `ak-all-board-notice`, `ak-all-board-columns`, and `ak-all-board-cards` for token-based spacing. Keep column headers outside their internal scroll areas. Reuse `TicketMoveDialog`, `TicketDetailDrawer`, and `useTicketDetailPresentation` across workspace and all-projects views.
- Avoid stacking multiple visibly misaligned scrollbars in one column. When separate scroll regions are necessary, place their scroll boxes on the same outer edge and move padding into shared inner wrappers such as `ak-scroll-content` or `ak-sidebar-scroll-content`.
- Use the shared spacing/radius tokens in `styles.css` for repeated chrome. If a panel header/body/action alignment needs a custom rhythm, add or reuse a named `ak-*` utility instead of scattering one-off `px-*`, `py-*`, and radius values.
- Ticket details share `TicketDetailFrame` and its `ak-ticket-detail-*` shell, fixed toolbar, and single internal scroll area. Keep `ak-drawer-header`, `ak-drawer-body`, and toolbar `ak-drawer-actions` aligned; do not restore a separate fixed title or competing scroll regions. Use `DialogContent layout="custom"` for this resizable shell while retaining Radix focus, Escape, and dismissal behavior.
- Ticket detail presentation is a local preference: preserve `side`/`modal`/`full` mode, side width, and center width/height through `useTicketDetailPresentation`. Clamp only the displayed dimensions on viewport changes, retain drafts across view changes, and share edge/keyboard resize behavior across both boards. Notion-inspired peek interaction does not replace the shadcn theme.
- Treat design tokens/theme foundation and this agent guidance as one system. Whenever `styles.css`, shadcn wrappers, or design token names change, update this section in the same change so future sessions keep following the foundation.

## UI Localization

- Korean is the default UI language; English remains selectable through the shared `LanguageSelector`. Persist only this display preference in `alpha-kanban.locale`, independently of workspace selection and document state.
- Keep UI copy in `apps/web/src/i18n/messages.ts` and use `useTranslation` in React components. English source strings are keys; translate complete sentences with interpolation instead of concatenating fragments. Translate accessibility labels, tooltips, empty/loading/error states, and format dates/numbers with the selected locale too.
- Translate status/type labels only at display boundaries. Keep API values, Markdown canonical fields, ticket IDs, document content, user input, paths, commands, and provider output unchanged. Shared default status-change reasons are document content and remain the exact text the writer will append.
- Do not translate at module initialization or store localized text as identifiers. Language switching must not remount forms, discard drafts, change routes, or write Markdown. Add both language entries and extend localization tests for new UI copy.
