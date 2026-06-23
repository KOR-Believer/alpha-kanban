# Agent Notes

## Browser Smoke

- Prefer the Chrome plugin first for visual smoke checks, layout review, and cursor/mouse feedback.
- Use the in-app browser only when Chrome is unavailable, blocked, or the task specifically targets the Codex in-app browser.
- Use Playwright CLI when a repeatable browser flow, DOM assertion, or scripted interaction is needed.
- Keep Playwright snapshots short. Avoid dumping large accessibility snapshots when the page has long project or ticket lists.
- For visual-only checks, use a screenshot or browser inspection summary instead of raw snapshot output.

## Product UI Design

- Before frontend visual or layout work, read `DESIGN-notion.md` from the project root and use it as the local design-system reference.
- Keep the app chrome Notion-like: warm paper canvas, white surfaces, near-black text, muted stone metadata, hairline borders, restrained radius, and minimal shadows.
- Reserve blue for primary action/focus/link signals. Do not use decorative color as structural chrome.
- Use a stable internal-scroll model for app shells. Scrollable regions should use the shared `ak-scroll-area` styling so scrollbar gutters, thumb weight, and edge alignment stay consistent.
- Avoid stacking multiple visibly misaligned scrollbars in one column. When separate scroll regions are necessary, place their scroll boxes on the same outer edge and move padding into shared inner wrappers such as `ak-scroll-content` or `ak-sidebar-scroll-content`.
- Use the shared spacing/radius tokens in `styles.css` for repeated chrome. If a panel header/body/action alignment needs a custom rhythm, add or reuse a named `ak-*` utility instead of scattering one-off `px-*`, `py-*`, and radius values.
- Ticket detail drawers should use `ak-drawer-header`, `ak-drawer-body`, and `ak-drawer-actions` so the close/mode affordances stay aligned with the panel padding rhythm.
- Ticket detail presentation is a local preference: preserve the localStorage-backed `side`/`modal` mode and side-panel width controls when changing the drawer.
- Treat design tokens/theme foundation and this agent guidance as one system. Whenever `styles.css`, shadcn wrappers, or design token names change, update this section in the same change so future sessions keep following the foundation.
