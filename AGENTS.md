# Agent Notes

## Browser Smoke

- Prefer the in-app browser or Chrome plugin for visual smoke checks, layout review, and cursor/mouse feedback.
- Use Playwright CLI when a repeatable browser flow, DOM assertion, or scripted interaction is needed.
- Keep Playwright snapshots short. Avoid dumping large accessibility snapshots when the page has long project or ticket lists.
- For visual-only checks, use a screenshot or browser inspection summary instead of raw snapshot output.
