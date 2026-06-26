# Agent Notes

## Browser Smoke

- Prefer the Chrome plugin first for visual smoke checks, layout review, and cursor/mouse feedback.
- Use the in-app browser only when Chrome is unavailable, blocked, or the task specifically targets the Codex in-app browser.
- Use Playwright CLI when a repeatable browser flow, DOM assertion, or scripted interaction is needed.
- Keep Playwright snapshots short. Avoid dumping large accessibility snapshots when the page has long project or ticket lists.
- For visual-only checks, use a screenshot or browser inspection summary instead of raw snapshot output.

## Plan-Ticketing Markdown

- Use the bundled `skills/plan-ticketing` skill as the operating protocol for creating or updating plan, ticket, and inventory documents.
- Prefer the repo-local `pnpm ticket-md` helper when changing ticket status, progress, `Completed at`, `사용자 지시`, or `진행 메모`.
- Use `pnpm ticket-md show <file> <ticket-id>` before editing an existing ticket so the exact ticket range is known.
- Use `pnpm ticket-md status`, `pnpm ticket-md append-user`, and `pnpm ticket-md append-note` for canonical ticket mutations. These commands update only the located ticket body and top-level `현재 진행률`.
- Run `pnpm ticket-md check <file>` after ticket document edits.
- Manual `apply_patch` edits are acceptable for non-canonical prose or checkbox changes, but keep them inside the inspected ticket range and re-run `pnpm ticket-md check`.
- Do not resurrect legacy Progress Board sections. Ticket body fields are the canonical source of truth.

## Product UI Design

- `DESIGN-notion.md` was deprecated and removed from this project. Do not recreate it or use it as the design-system source.
- Use the shadcn b1 preset foundation imported into `apps/web/src/styles.css`: Raleway variable font, OKLCH semantic tokens, olive/acid primary, rounded compact controls, hairline borders, and restrained shadows.
- Treat `styles.css` semantic variables (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, etc.) and the mapped `--ak-*` aliases as the single source of truth. Do not introduce a second color/radius/spacing system.
- Use the local `apps/web/src/components/ui/*` wrappers for buttons, badges, dialogs, popovers, selects, and checkboxes. Update those wrappers instead of scattering one-off Tailwind styling when common control styling is wrong.
- Use a stable internal-scroll model for app shells. Scrollable regions should use the shared `ak-scroll-area` styling so scrollbar gutters, thumb weight, and edge alignment stay consistent.
- Avoid stacking multiple visibly misaligned scrollbars in one column. When separate scroll regions are necessary, place their scroll boxes on the same outer edge and move padding into shared inner wrappers such as `ak-scroll-content` or `ak-sidebar-scroll-content`.
- Use the shared spacing/radius tokens in `styles.css` for repeated chrome. If a panel header/body/action alignment needs a custom rhythm, add or reuse a named `ak-*` utility instead of scattering one-off `px-*`, `py-*`, and radius values.
- Ticket detail drawers should use `ak-drawer-header`, `ak-drawer-body`, and `ak-drawer-actions` so the close/mode affordances stay aligned with the panel padding rhythm.
- Ticket detail presentation is a local preference: preserve the localStorage-backed `side`/`modal` mode and side-panel width controls when changing the drawer.
- Treat design tokens/theme foundation and this agent guidance as one system. Whenever `styles.css`, shadcn wrappers, or design token names change, update this section in the same change so future sessions keep following the foundation.
