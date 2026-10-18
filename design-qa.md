# Start and Introduction QA

## Scope

- Implemented the approved AKL-08 Start and AKL-14 introduction layouts in the existing shadcn theme. The existing board and ticket detail layout were not redesigned.
- Latest user decisions replace actual project screenshots with the fictional reading-project markup demo, keep board edits optional, and exclude owner-facing development reports from product copy.
- References: `docs/design/akl-08-start/README.md`, `docs/design/akl-14-intro/README.md`.

## Browser Evidence

- Chrome at 1440x900: actual Start has disjoint 5/35 project lists with independent 252px scrolling. Search/sort controls share 36px height, 6px radius, 14px type and the same top edge. Document availability uses primary/muted backgrounds with text labels.
- Chrome at 390x844: Start switches lists through tabs; the introduction shows the focused demo ticket. Korean/English checks found no horizontal page overflow. This is a browser viewport check, not a physical phone or OS folder-permission test.
- Introduction direct entry/reload, Start navigation, browser back/forward, language switching, installation dialog and Escape dismissal were checked. Explicit navigation from introduction stays on Start; fresh-root auto-open on/off is also covered by unit tests.
- Approved Start and actual Start were compared at 1440x900. The introduction reference is a 1440x2534 full-page image; comparison covered composition and hero content, not a claim of identical full-page pixels.
- Desktop captures were reviewed for Start and Introduction. The earlier mobile captures preceded the final small header/control corrections; they do not establish verification of those later changes.
- Fixed findings: search icon/input padding, narrow introduction header wrapping, mismatched search/select controls, indistinguishable document badges and owner-only development notices. No remaining blocking issue was observed in the checked views. Final Chrome error log was empty; the viewport override was reset.

## Automated Checks

- Web tests: 173 passed across 16 files, including intro isolation, navigation settings, shared guides, clipboard failure fallback, locale persistence, badge states and compact/field Select sizes.
- Web typecheck and browser production build passed. The existing large-bundle warning remains.
- Real clipboard permissions, new OS folder grants, physical mobile interaction, isolated skill installation and public hosting were not verified by these checks. AKL-13/15 retain the remaining release-contract, social-image and complete route-validation work.

## Result

The implemented UI passed the scoped checks above. This is a historical record of those checks, not a verification of every later release. Development status belongs in this report and the tickets, not on product pages.
