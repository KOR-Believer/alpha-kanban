# Cite a committed policy or source file

Use a normal Markdown link for a live working file. For a decision that depends on a particular revision, run the installed skill's helper. Node.js 24 and Git are sufficient.

```sh
node <skill>/scripts/document-cli.mjs revision-link --repo <target-checkout> --file policies/refund.md --heading "Refund period" --label "Refund period policy"
node <skill>/scripts/document-cli.mjs revision-link --repo <target-checkout> --file src/refund.ts --lines 42-57 --web-label "Web original"
```

Copy the JSON result's `markdown` field into the record. It contains a `web+akgit:` link and, when supported, an adjacent HTTPS permalink. Leave their destinations and separator intact so the viewer can show a single citation. The default link label includes the path, position and short commit. Choose a human-readable label that identifies the evidence.

The helper checks the target file and index against HEAD. A draft or an untracked file has no pinned citation. A dirty plan or unrelated file does not affect the target. Use `--rev <commit>` only when you actually read that committed snapshot. With an explicit revision, paths are resolved in its tree, including files since removed from the checkout. For a repeated Markdown heading pass its explicit fragment, for example `--heading '#refund-1'`. Use `--lines 42` for a single line.

An identifiable remote contributes a credential-free repository hint. The helper selects the tracking remote of the active branch, then origin, then a sole remote. Select another deliberately with `--remote <name>`. A GitHub or GitLab HTTPS companion needs a branch of that same remote, recorded locally, containing the commit. This is evidence as of the last sync. The command does not fetch, push, contact a hosting service, or change files. For an unshared commit, an unknown web host or a repository without a remote, the helper emits the local revision link on its own. A future reader needs the same Git object; for long-term shared evidence keep it reachable in a shared branch or tag.
