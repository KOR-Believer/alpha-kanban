import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { revisionHeadings } from "../../packages/shared/src/revisionHeadings.mjs";
import { normalizeGitRemote, revisionCitation, validRepoHint } from "../../skills/implementation-ledger/scripts/lib/revision-links.mjs";
import { fail } from "./document-fs.mjs";

const maxBytes = 10 * 1024 * 1024;
function git(cwd, args, optional = false) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) delete env[key];
  const result = spawnSync("git", ["--literal-pathspecs", "-C", cwd, ...args], { env, maxBuffer: maxBytes + 1024, timeout: 15000, windowsHide: true });
  if (!result.error && result.status === 0) return result.stdout;
  if (optional && !result.error) return;
  fail("GIT_READ_FAILED", "Git could not read the requested file, revision or repository.");
}
const output = bytes => bytes?.toString("utf8").replace(/\r?\n$/, "");
function remoteFor(cwd, requested) {
  const names = output(git(cwd, ["remote"])).split("\n").filter(Boolean);
  const branch = output(git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"], true));
  const upstream = branch && output(git(cwd, ["config", "--get", "branch." + branch + ".remote"], true));
  const name = requested ?? (names.includes(upstream) ? upstream : names.includes("origin") ? "origin" : names.length === 1 ? names[0] : undefined);
  if (requested && !names.includes(requested)) fail("UNKNOWN_REMOTE", "Select a remote configured in the target repository.");
  if (!name || name.startsWith("-")) return {};
  const urls = output(git(cwd, ["remote", "get-url", "--all", name], true))?.split("\n");
  const repo = urls?.length === 1 ? normalizeGitRemote(urls[0]) : undefined;
  return { name, repo: validRepoHint(repo) ? repo : undefined };
}
function anchorFor(flags, bytes, file) {
  if (!flags.lines && !flags.heading) return;
  if (flags.lines && flags.heading) fail("INVALID_ARGUMENTS", "Choose a line range or a Markdown heading.");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("INVALID_LOCATION", "Line and heading citations require UTF-8 text."); }
  if (text.includes("\0")) fail("INVALID_LOCATION", "Binary files do not have citable lines.");
  if (flags.lines) {
    const m = /^([1-9]\d*)(?:-([1-9]\d*))?$/.exec(flags.lines);
    const first = Number(m?.[1]), last = Number(m?.[2] ?? first);
    const count = text ? text.replace(/\n$/, "").split("\n").length : 0;
    if (!m || last < first || last > count) fail("INVALID_LOCATION", "Select lines present in the cited revision.");
    return "L" + first + (last === first ? "" : "-L" + last);
  }
  if (!/\.(?:md|markdown)$/i.test(file)) fail("INVALID_LOCATION", "A heading requires a Markdown file.");
  const headings = revisionHeadings(text);
  const hits = flags.heading.startsWith("#") ? headings.filter(h => h.anchor === flags.heading.slice(1)) : headings.filter(h => h.title === flags.heading);
  if (hits.length !== 1 || !hits[0].anchor) fail("INVALID_LOCATION", "Select a unique heading or its exact #fragment from the cited revision.");
  return hits[0].anchor;
}
export function createRevisionCitation(flags, cwd = process.cwd()) {
  const requested = path.resolve(cwd, flags.repo ?? ".", flags.file);
  let requestedBase = flags.repo ? path.resolve(cwd, flags.repo) : path.dirname(requested);
  if (flags.rev && !flags.repo) {
    // A parent in the historical tree may have been moved or deleted since.
    while (requestedBase !== path.dirname(requestedBase) && !statSync(requestedBase, { throwIfNoEntry: false })?.isDirectory()) {
      requestedBase = path.dirname(requestedBase);
    }
  }
  const base = realpathSync(requestedBase);
  const file = path.resolve(base, path.relative(requestedBase, requested));
  const root = realpathSync(output(git(base, ["rev-parse", "--show-toplevel"])));
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (!relative || path.isAbsolute(relative) || relative.startsWith("../") || relative.split("/").includes(".git")) fail("INVALID_PATH", "Choose a file inside the target worktree.");
  const commit = output(git(root, ["rev-parse", "--verify", "--end-of-options", (flags.rev ?? "HEAD") + "^{commit}"]));
  const entry = output(git(root, ["ls-tree", "-z", commit, "--", relative]));
  const match = /^100(?:644|755) blob ([a-f\d]+)\t/.exec(entry);
  if (!match) fail("NO_COMMITTED_FILE", "No regular committed file exists at this path in the selected revision.");
  const oid = match[1];
  if (Number(output(git(root, ["cat-file", "-s", oid]))) > maxBytes) fail("FILE_TOO_LARGE", "The citation limit is 10 MiB.");
  const bytes = git(root, ["cat-file", "blob", oid]);
  if (!flags.rev) {
    const staged = output(git(root, ["ls-files", "--stage", "-z", "--", relative]));
    if (!staged.startsWith(entry.slice(0, 6) + " " + oid + " 0\t")) fail("UNCOMMITTED_FILE", "The index differs from the committed file. Cite a reviewed commit or omit this link.");
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size > maxBytes || realpathSync(file) !== file) fail("UNCOMMITTED_FILE", "The working file cannot be matched to the commit.");
    const current = readFileSync(file);
    if (!current.equals(bytes)) {
      const eol = output(git(root, ["ls-files", "--eol", "--", relative]));
      if (!/^i\/lf\s+w\/crlf\s/.test(eol) || !Buffer.from(current.toString("latin1").replace(/\r\n/g, "\n"), "latin1").equals(bytes)) {
        fail("UNCOMMITTED_FILE", "The working file differs from the commit. Cite a reviewed commit or omit this link.");
      }
    }
  }
  const { name, repo } = remoteFor(root, flags.remote);
  // Only a remote-tracking ref for this particular remote counts. HEAD, tags and
  // a URL alone say nothing about which server has received the commit.
  const tracked = repo && output(git(root, ["for-each-ref", "--count=1", "--format=%(refname)", "--contains=" + commit, "refs/remotes/" + name + "/"]));
  const citation = revisionCitation({ commit, path: relative, repo, anchor: anchorFor(flags, bytes, relative) },
    { label: flags.label, webLabel: flags["web-label"], published: Boolean(tracked) });
  return { ok: true, ...citation, publication: tracked ? "remote-tracking-ref" : "unconfirmed" };
}
