# README images

`icon.png` is the application's generated stable-channel icon, copied without changes. Its source glyph is covered by the [Octicons license](../../../apps/web/public-browser/licenses/octicons-MIT.txt).

`board-{ko,en}-{light,dark}.jpg` are screenshots of the stable-channel web app rendering the public [reading journal examples](../../../examples/reading-journal). The documents use the same fictional story as [`intro/demo.ts`](../../../apps/web/src/components/intro/demo.ts). They contain no private projects or user data.

To refresh a screenshot, copy the matching language's example files into `docs/` in a disposable project, connect that project in the app, open its tickets, and choose the matching UI language and theme. Capture the board with its document sidebar and navigation. The current images crop the empty area below the cards; no UI elements or text were composited or retouched.

Both READMEs use a `<picture>` element to select the matching image for GitHub's light or dark appearance. Keep the default image, its dark variant, and descriptive alternative text together when updating them.
