import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, rename, chmod, symlink, cp, lstat, realpath } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { resolveDocumentContext } from "../../skills/implementation-ledger/scripts/lib/document-context.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const script = path.join(repo, "skills/implementation-ledger/scripts/document-context.mjs");
const policy = value => `[documents]\nownerFolders = ${value}\n`;
const user = id => `[user]\nid = ${id}\n`;
const cleanGitEnv = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" });
function git(dir, ...args) { return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: cleanGitEnv(), stdio: ["ignore", "pipe", "pipe"] }).replace(/\r?\n$/, ""); }
async function put(file, content) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); }
async function fixture(t, withGit = true) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "ledger-context-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace 한글");
  const project = path.join(workspace, "sample project");
  const home = path.join(root, "home");
  await mkdir(project, { recursive: true }); await mkdir(home);
  if (withGit) {
    git(project, "init", "-q");
    git(project, "config", "user.name", "Fixture"); git(project, "config", "user.email", "fixture@example.invalid");
    git(project, "config", "commit.gpgsign", "false"); git(project, "config", "core.hooksPath", path.join(root, "no-hooks"));
    await put(path.join(project, ".git/info/exclude"), "/.ak.user\n");
  }
  return { root, workspace, project, home, resolve: options => resolveDocumentContext({ cwd: project, home, ...options }) };
}
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); return result; }
function error(result, code) { assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, code, JSON.stringify(result)); }
async function snapshot(root) {
  const result = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) { result[path.relative(root, target) + "/"] = "directory"; await walk(target); }
      else result[path.relative(root, target)] = createHash("sha256").update(await readFile(target)).digest("hex");
    }
  }
  await walk(root); return result;
}

test("no settings preserves the existing basic location and creates nothing", async t => {
  const f = await fixture(t);
  await put(path.join(f.project, "notes/03_existing_plan.md"), "# Existing\n\nBody\n");
  const before = await snapshot(f.root);
  const result = ok(await f.resolve({ baseDir: "notes" }));
  assert.equal(result.policy.value, false); assert.equal(result.policy.source.scope, "default");
  assert.equal(result.user.status, "not-needed"); assert.equal(result.document.relativePath, "notes");
  assert.equal(result.document.ownerHeader, null); assert.equal(result.numbering.mode, "existing-convention");
  assert.deepEqual(await snapshot(f.root), before);
  ok(await f.resolve({ home: path.join(f.root, "unavailable-home") }));
});

test("home user, invalid user, existing @ folders and unbound ancestor settings do not opt in", async t => {
  const f = await fixture(t);
  await put(path.join(f.home, ".ak.user"), user("@alice"));
  await put(path.join(f.workspace, ".ak.config"), policy(true));
  await put(path.join(f.project, ".ak.user"), "broken personal settings");
  await put(path.join(f.project, "docs/@bob/90_notes.md"), "# Notes\n");
  const result = ok(await f.resolve());
  assert.equal(result.document.relativePath, "docs"); assert.equal(result.user.status, "not-needed");
  error(await f.resolve({ baseDir: "docs/@bob" }), "EXPLICIT_OWNER_TARGET");
});

test("shared and private precedence are independent, with false overriding workspace true", async t => {
  const f = await fixture(t);
  git(f.project, "config", "alphaKanban.workspaceRoot", f.workspace);
  await put(path.join(f.workspace, ".ak.config"), policy(true));
  await put(path.join(f.workspace, ".ak.user"), user("@workspace"));
  await put(path.join(f.home, ".ak.user"), user("@home"));
  const inherited = ok(await f.resolve());
  assert.equal(inherited.policy.source.scope, "workspace"); assert.equal(inherited.user.value, "@workspace");
  await put(path.join(f.project, ".ak.config"), policy(false));
  await put(path.join(f.project, ".ak.user"), "broken");
  const disabled = ok(await f.resolve()); assert.equal(disabled.policy.value, false); assert.equal(disabled.user.status, "not-needed");
  await put(path.join(f.project, ".ak.config"), policy(true));
  error(await f.resolve(), "SETTINGS_SYNTAX");
  await put(path.join(f.project, ".ak.user"), user("@repo"));
  const own = ok(await f.resolve()); assert.equal(own.user.value, "@repo"); assert.equal(own.user.source.scope, "repo");
  await put(path.join(f.project, ".ak.user"), "[user]\n# unset\n");
  await rm(path.join(f.workspace, ".ak.user"));
  const home = ok(await f.resolve()); assert.equal(home.user.value, "@home"); assert.equal(home.user.source.scope, "home");
});

test("true without user reports user-required without creating a directory", async t => {
  const f = await fixture(t); await put(path.join(f.project, ".ak.config"), policy(true));
  const before = await snapshot(f.root);
  const result = await f.resolve(); error(result, "USER_REQUIRED"); assert.equal(result.user.status, "unset");
  assert.deepEqual(await snapshot(f.root), before);
});

test("settings errors are not absence, while unused settings cannot block explicit work", async t => {
  const f = await fixture(t);
  const cases = [
    ["[user]\nid = @alice\n", "SETTINGS_ROLE"],
    ["[documents]\nownerFolders = yes\n", "SETTINGS_VALUE"],
    ["[documents]\nownerFolders = true\nownerfolders = false\n", "SETTINGS_DUPLICATE"],
    ["[include]\npath = other\n", "SETTINGS_KEY"],
    ["[documents]\nunknown = true\n", "SETTINGS_KEY"],
    ["[documents]\nownerFolders = true\ninvalid\n", "SETTINGS_SYNTAX"],
  ];
  await put(path.join(f.project, "docs/@bob/01_notes.md"), "# Notes\n\nOwner: @old\n\n## Body\n");
  for (const [content, code] of cases) {
    await put(path.join(f.project, ".ak.config"), content);
    const failed = await f.resolve(); error(failed, code); assert.equal(failed.policy.status, "unresolved");
    const explicit = ok(await f.resolve({ target: "docs/manual" })); assert.equal(explicit.policy.status, "not-needed");
    const edit = ok(await f.resolve({ operation: "edit", target: "docs/@bob/01_notes.md" }));
    assert.equal(edit.document.pathOwner.value, "@bob"); assert.equal(edit.document.ownerAction, "preserve");
  }
  await writeFile(path.join(f.project, ".ak.config"), Buffer.from([0xff]));
  error(await f.resolve(), "SETTINGS_READ_FAILED");
});

test("private malformed or misplaced values never fall back to another user", async t => {
  const f = await fixture(t); await put(path.join(f.project, ".ak.config"), policy(true));
  await put(path.join(f.home, ".ak.user"), user("@fallback"));
  for (const [content, code] of [[user("not-an-owner"), "INVALID_OWNER"], ["[documents]\nownerFolders = true\n", "SETTINGS_ROLE"], ["[user]\nid = @alice\nid = @bob\n", "SETTINGS_DUPLICATE"]]) {
    await put(path.join(f.project, ".ak.user"), content);
    const result = await f.resolve(); error(result, code); assert.equal(result.user.status, "unresolved");
  }
});

test("explicit owned and ordinary targets do not require identity or default policy", async t => {
  const f = await fixture(t); await put(path.join(f.project, ".ak.config"), policy(true));
  const own = ok(await f.resolve({ target: "docs/@홍길동/research" }));
  assert.equal(own.document.ownerHeader, "Owner: @홍길동"); assert.equal(own.numbering.next, "01"); assert.equal(own.user.status, "not-needed");
  const basic = ok(await f.resolve({ target: "notes" })); assert.equal(basic.document.ownerHeader, null);
  const deep = ok(await f.resolve({ target: "docs/research/@alice" })); assert.equal(deep.document.pathOwner.value, "@alice");
  const nested = ok(await f.resolve({ target: "docs/@alice/archive/@bob/research" }));
  assert.equal(nested.document.pathOwner.value, "@bob"); assert.equal(nested.document.ownerHeader, "Owner: @bob");
  assert.equal(nested.document.relativePath, "docs/@alice/archive/@bob/research");
  error(await f.resolve({ target: "docs/@" }), "INVALID_OWNER");
});

test("owner numbering includes ordinary descendants but each nested @ directory has its own sequence", async t => {
  const f = await fixture(t);
  for (const name of ["docs/90_legacy.md", "docs/@bob/99_other.md", "docs/@alice/01_a.md", "docs/@alice/04_a_plan.md", "docs/@alice/04_b_tickets.md", "docs/@alice/research/24_old_plan.md", "docs/@alice/research/25_old_tickets.md", "docs/@alice/archive/@bob/100_inner.md", "docs/@alice/archive/@alice/200_inner.md"]) await put(path.join(f.project, name), "# Notes\n");
  const result = ok(await f.resolve({ target: "docs/@alice/research" }));
  assert.equal(result.numbering.maximum, 25); assert.equal(result.numbering.next, "26");
  assert.equal(ok(await f.resolve({ target: "docs/@alice/archive/@bob" })).numbering.next, "101");
  assert.equal(ok(await f.resolve({ target: "docs/@alice/archive/@alice" })).numbering.next, "201");
  await put(path.join(f.project, "docs/@alice/9007199254740992_too_large.md"), "# Notes\n");
  error(await f.resolve({ target: "docs/@alice" }), "NUMBER_OVERFLOW");
});

test("turning policy off preserves existing Owner and path, including malformed metadata", async t => {
  const f = await fixture(t);
  const file = path.join(f.project, "docs/@alice/01_notes.md");
  const content = "# Notes\n\nOwner: @old\nOwner: invalid\n\n## Body\n";
  await put(file, content); await put(path.join(f.project, ".ak.config"), policy(false));
  const edit = ok(await f.resolve({ operation: "edit", target: file }));
  assert.equal(edit.document.pathOwner.value, "@alice"); assert.equal(edit.user.status, "not-needed");
  assert.equal(await readFile(file, "utf8"), content); assert.equal(ok(await f.resolve()).document.ownerHeader, null);
});

test("new-document check validates the header against its path and writes nothing", async t => {
  const f = await fixture(t);
  const file = path.join(f.project, "docs/@alice/01_notes.md");
  await put(file, "# Notes\n\nOwner: @alice\n\n## Body\nOwner: @bob\n");
  const before = await snapshot(f.root); ok(await f.resolve({ operation: "check-new", target: file }));
  assert.deepEqual(await snapshot(f.root), before);
  await put(file, "# Notes\n\nOwner: @bob\n"); error(await f.resolve({ operation: "check-new", target: file }), "OWNER_MISMATCH");
  await put(path.join(f.project, "docs/01_basic.md"), "# Basic\n\nOwner: @alice\n");
  error(await f.resolve({ operation: "check-new", target: "docs/01_basic.md" }), "OWNER_MISMATCH");
});

test("new and edit inspection agree on the nearest owner without consulting identity or rewriting history", async t => {
  const f = await fixture(t), target = "docs/@bob/archive/@alice/01_notes.md";
  const file = path.join(f.project, target), content = "# Notes\n\nOwner: @alice\n\n## Body\nOwner: @bob\n";
  await put(file, content);
  await put(path.join(f.project, ".ak.user"), "invalid unused identity\n");
  const before = await snapshot(f.root);
  ok(await f.resolve({ operation: "check-new", target }));
  const edit = ok(await f.resolve({ operation: "edit", target }));
  assert.equal(edit.document.pathOwner.value, "@alice"); assert.equal(edit.document.ownerAction, "preserve");
  assert.deepEqual(await snapshot(f.root), before);
  await put(file, content.replace("Owner: @alice", "Owner: @bob"));
  error(await f.resolve({ operation: "check-new", target }), "OWNER_MISMATCH");
  error(await f.resolve({ target: "docs/@bob/@" }), "INVALID_OWNER");
});

test("native detached external worktree uses current shared policy and original private user", async t => {
  const f = await fixture(t);
  await put(path.join(f.project, ".ak.config"), policy(false));
  await put(path.join(f.project, ".ak.user"), user("@original"));
  git(f.project, "add", ".ak.config"); git(f.project, "commit", "-qm", "fixture");
  git(f.project, "config", "alphaKanban.workspaceRoot", f.workspace);
  await put(path.join(f.workspace, ".ak.user"), user("@workspace"));
  const worktree = path.join(f.root, "outside 한글", "checkout");
  git(f.project, "worktree", "add", "--quiet", "--detach", worktree);
  await put(path.join(f.root, "outside 한글/.ak.config"), policy(false));
  await put(path.join(worktree, ".ak.user"), user("@wrong-worktree"));
  await put(path.join(worktree, ".ak.config"), policy(true));
  const before = await snapshot(f.root);
  const result = ok(await f.resolve({ cwd: worktree }));
  assert.equal(result.user.value, "@original"); assert.equal(result.user.source.path, path.join(f.project, ".ak.user"));
  assert.equal(result.policy.source.path, path.join(worktree, ".ak.config"));
  assert.equal(result.document.path, path.join(worktree, "docs/@original"));
  assert.deepEqual(await snapshot(f.root), before);
  await rm(path.join(worktree, ".ak.config")); await put(path.join(f.workspace, ".ak.config"), policy(true));
  const inherited = ok(await f.resolve({ cwd: worktree })); assert.equal(inherited.policy.source.scope, "workspace");
  await rm(path.join(f.project, ".ak.user"));
  assert.equal(ok(await f.resolve({ cwd: worktree })).user.value, "@workspace");
});

test("a moved main does not fall through to home; explicit Git repair restores inheritance", async t => {
  const f = await fixture(t);
  await put(path.join(f.project, ".ak.config"), policy(true)); await put(path.join(f.project, ".ak.user"), user("@original"));
  await put(path.join(f.home, ".ak.user"), user("@fallback"));
  git(f.project, "add", ".ak.config"); git(f.project, "commit", "-qm", "fixture");
  const linked = path.join(f.root, "linked"); git(f.project, "worktree", "add", "--quiet", "--detach", linked);
  const moved = path.join(f.workspace, "moved"); await rename(f.project, moved);
  error(await f.resolve({ cwd: linked }), "GIT_UNRESOLVED");
  await put(path.join(linked, "docs/01_existing.md"), "# Existing\n");
  ok(await f.resolve({ cwd: linked, operation: "edit", target: "docs/01_existing.md" }));
  git(moved, "worktree", "repair", linked);
  assert.equal(ok(await f.resolve({ cwd: linked })).user.value, "@original");
});

test("workspace bindings are local, unique, explicit, and never follow includes or worktree overrides", async t => {
  const f = await fixture(t);
  await put(path.join(f.project, "README.md"), "fixture"); git(f.project, "add", "README.md"); git(f.project, "commit", "-qm", "fixture");
  const second = path.join(f.root, "second-workspace"); await mkdir(second);
  await put(path.join(second, ".ak.config"), policy(true)); await put(path.join(second, ".ak.user"), user("@second"));
  git(f.project, "config", "alphaKanban.workspaceRoot", second);
  await put(path.join(f.workspace, ".ak.config"), policy(true)); await put(path.join(f.workspace, ".ak.user"), user("@wrong"));
  assert.equal(ok(await f.resolve()).user.value, "@second");
  const include = path.join(f.root, "included-config"); await put(include, `[alphaKanban]\nworkspaceRoot = "${f.workspace}"\n`);
  git(f.project, "config", "include.path", include);
  git(f.project, "config", "extensions.worktreeConfig", "true"); git(f.project, "config", "--worktree", "alphaKanban.workspaceRoot", f.workspace);
  assert.equal(ok(await f.resolve()).user.value, "@second");
  git(f.project, "config", "--add", "alphaKanban.workspaceRoot", f.workspace);
  error(await f.resolve(), "WORKSPACE_INVALID");
  git(f.project, "config", "--unset-all", "alphaKanban.workspaceRoot");
  assert.equal(ok(await f.resolve()).policy.value, false);
  git(f.project, "config", "alphaKanban.workspaceRoot", path.join(f.root, "missing"));
  error(await f.resolve(), "WORKSPACE_UNRESOLVED");
  // Each missing shared key needs its own fallback; specifying both avoids it.
  await put(path.join(f.project, ".ak.config"), policy(false)); error(await f.resolve(), "WORKSPACE_UNRESOLVED");
  await put(path.join(f.project, ".ak.config"), policy(false) + "root = docs\n"); assert.equal(ok(await f.resolve()).policy.value, false);
});

test("an independent clone with the same remote does not inherit local settings", async t => {
  const f = await fixture(t);
  await put(path.join(f.project, "README.md"), "fixture"); git(f.project, "add", "README.md"); git(f.project, "commit", "-qm", "fixture");
  git(f.project, "config", "alphaKanban.workspaceRoot", f.workspace);
  await put(path.join(f.workspace, ".ak.config"), policy(true)); await put(path.join(f.workspace, ".ak.user"), user("@original"));
  const clone = path.join(f.root, "clone"); git(f.root, "clone", "--quiet", "--no-hardlinks", f.project, clone);
  const result = ok(await f.resolve({ cwd: clone })); assert.equal(result.policy.value, false); assert.equal(result.user.status, "not-needed");
});

test("bare and separate-git-dir linked main candidates must be verifiable working trees", async t => {
  const f = await fixture(t, false);
  const admin = path.join(f.root, "admin"); git(f.project, "init", "-q", "--separate-git-dir", admin);
  git(f.project, "config", "user.name", "Fixture"); git(f.project, "config", "user.email", "fixture@example.invalid"); git(f.project, "config", "commit.gpgsign", "false");
  await put(path.join(f.project, ".ak.config"), policy(true)); await put(path.join(f.project, ".ak.user"), user("@original"));
  git(f.project, "add", ".ak.config"); git(f.project, "commit", "-qm", "fixture");
  assert.equal(ok(await f.resolve()).user.value, "@original");
  const linked = path.join(f.root, "linked"); git(f.project, "worktree", "add", "--quiet", "--detach", linked);
  error(await f.resolve({ cwd: linked }), "PRIVATE_ROOT_UNRESOLVED");
  const bare = path.join(f.root, "bare.git"); git(f.root, "clone", "--quiet", "--bare", f.project, bare);
  const bareLinked = path.join(f.root, "bare-linked"); git(bare, "worktree", "add", "--quiet", "--detach", bareLinked);
  error(await f.resolve({ cwd: bareLinked }), "PRIVATE_ROOT_UNRESOLVED");
});

test("read failures and unsafe targets do not become missing/default values", async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.project, ".ak.config")); error(await f.resolve(), "SETTINGS_READ_FAILED"); await rm(path.join(f.project, ".ak.config"), { recursive: true });
  error(await f.resolve({ target: "../outside" }), "OUTSIDE_PROJECT");
  error(await f.resolve({ target: ".git/docs" }), "GIT_PATH");
  const nested = path.join(f.project, "nested"); await mkdir(nested); git(nested, "init", "-q");
  error(await f.resolve({ target: "nested/docs" }), "NESTED_REPOSITORY");
  await mkdir(path.join(f.project, "docs"));
  await symlink(f.home, path.join(f.project, "docs/link"), "dir"); error(await f.resolve({ target: "docs/link" }), "SYMLINK_TARGET");
  await put(path.join(f.project, "docs/@alice/01_notes.md"), "# Notes\n");
  await symlink(f.home, path.join(f.project, "docs/@alice/link"), "dir"); error(await f.resolve({ target: "docs/@alice" }), "NUMBER_SCAN_LINK");
});

test("settings permission failure is reported only when the file is needed", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async t => {
  const f = await fixture(t); const file = path.join(f.project, ".ak.config"); await put(file, policy(true)); await chmod(file, 0);
  try {
    error(await f.resolve(), "SETTINGS_READ_FAILED");
    // A new target needs a trustworthy owner boundary; existing edits do not.
    error(await f.resolve({ target: "docs/manual" }), "SETTINGS_READ_FAILED");
    await put(path.join(f.project, "docs/01_existing.md"), "# Existing\n");
    assert.equal(ok(await f.resolve({ operation: "edit", target: "docs/01_existing.md" })).document.pathOwner.status, "invalid");
  }
  finally { await chmod(file, 0o600); }
});

test("document root defaults to docs and inherits each shared key independently", async t => {
  const f = await fixture(t);
  assert.equal(ok(await f.resolve()).document.relativePath, "docs");
  await put(path.join(f.project, ".ak.config"), "[documents]\nroot = notes/planning\n");
  let result = ok(await f.resolve());
  assert.equal(result.document.relativePath, "notes/planning"); assert.equal(result.policy.value, false); assert.equal(result.user.status, "not-needed");
  git(f.project, "config", "alphaKanban.workspaceRoot", f.workspace);
  await put(path.join(f.workspace, ".ak.config"), "[documents]\nroot = shared-notes\nownerFolders = true\n");
  await put(path.join(f.project, ".ak.user"), user("@alice"));
  result = ok(await f.resolve());
  assert.equal(result.document.relativePath, "notes/planning/@alice"); assert.equal(result.policy.source.scope, "workspace");
  await put(path.join(f.project, ".ak.config"), policy(false));
  result = ok(await f.resolve());
  assert.equal(result.document.relativePath, "shared-notes"); assert.equal(result.document.path, path.join(f.project, "shared-notes"));
  assert.equal(result.documentRoot.source.scope, "workspace"); assert.equal(result.policy.source.scope, "repo");
  await put(path.join(f.project, "shared-notes/@bob/08_notes.md"), "# Notes\nOwner: @bob\n");
  await put(path.join(f.project, "shared-notes/@bob/@alice/99_notes.md"), "# Notes\nOwner: @alice\n");
  result = ok(await f.resolve({ target: "shared-notes/@bob" }));
  assert.equal(result.numbering.next, "09"); assert.equal(result.document.ownerHeader, "Owner: @bob");
  ok(await f.resolve({ operation: "check-new", target: "shared-notes/@bob/08_notes.md" }));
  assert.equal(ok(await f.resolve({ baseDir: "manual" })).document.relativePath, "manual");
});

test("external linked worktree uses its own document root and inherits only the original user", async t => {
  const f = await fixture(t);
  await put(path.join(f.project, ".ak.config"), policy(true) + "root = notes\n");
  await put(path.join(f.project, ".ak.user"), user("@original"));
  git(f.project, "add", ".ak.config"); git(f.project, "commit", "-qm", "fixture");
  const linked = path.join(f.root, "linked"); git(f.project, "worktree", "add", "--quiet", "--detach", linked);
  await put(path.join(linked, ".ak.config"), policy(true) + "root = planning\n");
  const result = ok(await f.resolve({ cwd: linked }));
  assert.equal(result.document.path, path.join(linked, "planning/@original"));
  assert.equal(result.documentRoot.source.path, path.join(linked, ".ak.config"));
});

test("an inaccessible original worktree cannot substitute the home actor", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async t => {
  const f = await fixture(t); await put(path.join(f.project, ".ak.config"), policy(true)); await put(path.join(f.project, ".ak.user"), user("@original"));
  await put(path.join(f.home, ".ak.user"), user("@home"));
  git(f.project, "add", ".ak.config"); git(f.project, "commit", "-qm", "fixture");
  const linked = path.join(f.root, "linked"); git(f.project, "worktree", "add", "--quiet", "--detach", linked);
  await chmod(f.project, 0);
  try { error(await f.resolve({ cwd: linked }), "GIT_UNRESOLVED"); }
  finally { await chmod(f.project, 0o700); }
});

test("Git environment overrides cannot redirect the current project or actor", async t => {
  const f = await fixture(t); await put(path.join(f.project, ".ak.user"), user("@current"));
  const child = spawnSync(process.execPath, [script, "actor", "--cwd", f.project, "--home", f.home], {
    encoding: "utf8", env: { ...process.env, GIT_DIR: path.join(f.root, "wrong.git"), GIT_WORK_TREE: f.home, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.worktree", GIT_CONFIG_VALUE_0: f.home },
  });
  assert.equal(child.status, 0, child.stdout + child.stderr); assert.equal(JSON.parse(child.stdout).user.value, "@current");
});

test("absolute paths through an alias of the project root are accepted, not descendant symlinks", async t => {
  const f = await fixture(t); const alias = path.join(f.root, "project-alias");
  await symlink(f.project, alias, "dir"); await put(path.join(f.project, "docs/01_notes.md"), "# Notes\n");
  const result = ok(await f.resolve({ operation: "edit", target: path.join(alias, "docs/01_notes.md") }));
  assert.equal(result.document.path, path.join(f.project, "docs/01_notes.md"));
  await symlink(f.home, path.join(f.project, "docs/escape"), "dir");
  error(await f.resolve({ target: path.join(alias, "docs/escape") }), "SYMLINK_TARGET");
});

test("case collisions and Unicode normalization never silently select a different owner", async t => {
  const f = await fixture(t);
  await put(path.join(f.project, "docs/@Alice/01_notes.md"), "# Notes\n");
  error(await f.resolve({ target: "docs/@alice" }), "OWNER_COLLISION");
  const decomposed = "@홍길동".normalize("NFD"); await put(path.join(f.project, "docs", decomposed, "04_notes.md"), "# Notes\n");
  const result = ok(await f.resolve({ target: "docs/@홍길동" })); assert.equal(result.document.ownerHeader, "Owner: @홍길동"); assert.equal(result.numbering.next, "05");
});

test("standalone copied skill works without project node_modules and emits machine-readable failures", async t => {
  const f = await fixture(t, false);
  const installed = path.join(f.root, "installed/implementation-ledger"); await cp(path.join(repo, "skills/implementation-ledger"), installed, { recursive: true });
  const entry = path.join(installed, "scripts/document-context.mjs");
  const run = args => spawnSync(process.execPath, [entry, ...args, "--cwd", f.project, "--home", f.home], { encoding: "utf8" });
  let child = run(["new"]); assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).policy.value, false);
  await put(path.join(f.project, ".ak.config"), policy(true)); child = run(["new"]); assert.equal(child.status, 3); assert.equal(JSON.parse(child.stdout).diagnostics[0].code, "USER_REQUIRED");
  child = run(["edit"]); assert.equal(child.status, 2); assert.equal(JSON.parse(child.stdout).diagnostics[0].code, "INVALID_REQUEST");
  child = run(["new", "--unknown"]); assert.equal(child.status, 2); assert.equal(JSON.parse(child.stdout).ok, false);
  child = run(["new", "--target", "docs/manual"]); assert.equal(child.status, 0);
  const nested = "docs/@bob/archive/@alice";
  await put(path.join(f.project, nested, "24_notes.md"), "# Notes\nOwner: @alice\n");
  child = run(["new", "--target", nested]); assert.equal(child.status, 0, child.stdout);
  const context = JSON.parse(child.stdout);
  assert.equal(context.document.relativePath, nested); assert.equal(context.document.ownerHeader, "Owner: @alice");
  assert.equal(context.numbering.next, "25");
  child = run(["check-new", "--target", `${nested}/24_notes.md`]); assert.equal(child.status, 0, child.stdout);
  child = run(["edit", "--target", `${nested}/24_notes.md`]); assert.equal(child.status, 0, child.stdout);
  assert.equal(JSON.parse(child.stdout).document.pathOwner.value, "@alice");
  assert.equal((await lstat(entry)).isFile(), true);
});

test("optional new IDs are generated per file without enabling ownership or changing an existing document", async t => {
  const f = await fixture(t);
  const basic = ok(await f.resolve()); assert.equal(basic.document.documentIdHeader, null);
  const one = ok(await f.resolve({ withId: true })), two = ok(await f.resolve({ withId: true }));
  assert.match(one.document.documentIdHeader, /^Document-ID: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(one.document.documentIdHeader, two.document.documentIdHeader);
  assert.equal(one.document.ownerHeader, null); assert.equal(one.user.status, "not-needed");
  assert.equal((await f.resolve({ operation: "actor", withId: true })).ok, false);
});
