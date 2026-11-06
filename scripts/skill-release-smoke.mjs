import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { parseArgs, promisify } from "node:util";
import { chromium } from "playwright";
import { unzipSync } from "fflate";

// Unlike the controlled PWA lifecycle fixture, this checks the authored release
// and compiled UI unchanged. Only the picker is replaced with an isolated OPFS
// fixture; no user profile, installed skill or native folder is opened.
const { values } = parseArgs({ options: { origin: { type: "string" }, dir: { type: "string", default: "apps/web/dist-browser" } } });
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output/playwright/skill-release-" + Date.now());
const exec = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const filesOnly = (files) => files.map(({ path, content }) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path));
await mkdir(output, { recursive: true });
let server, browser, page, failure;
let origin = values.origin && new URL(values.origin).origin;
const report = { origin, checks: [], limitation: "Isolated Chrome with OPFS handles; not a native folder picker, OS metadata or AI recognition test." };
const pass = (message) => { report.checks.push(message); console.log("PASS", message); };

async function snapshot(page) {
  return page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("implementation-ledger");
    const files = [];
    async function walk(directory, prefix = "") {
      for await (const entry of directory.values()) {
        if (entry.kind === "directory") await walk(entry, prefix + entry.name + "/");
        else files.push({ path: prefix + entry.name, content: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await (await entry.getFile()).arrayBuffer()) });
      }
    }
    await walk(root); return files;
  });
}

async function checkInstallation(fixture, bundle) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
  try {
    await context.addInitScript(() => localStorage.setItem("alpha-kanban.locale", "ko"));
    page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/about#updates");
    await page.evaluate(async (files) => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("implementation-ledger", { create: true });
      for (const file of files) {
        const parts = file.path.split("/"), name = parts.pop(); let dir = root;
        for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
        const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await writable.write(file.content); await writable.close();
      }
      window.showDirectoryPicker = async () => root;
    }, fixture.files);
    await page.getByRole("button", { name: "설치된 스킬 등록·관리", exact: true }).click();
    await page.getByRole("button", { name: "폴더 선택", exact: true }).click();
    const label = fixture.custom ? "백업 후 다시 설치" : "백업 후 스킬 업데이트";
    if (fixture.custom) {
      await page.getByRole("heading", { name: "알려진 공식 배포본과 내용이 다릅니다. 일반 업데이트로는 교체하지 않습니다.", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "백업 후 스킬 업데이트", exact: true }).count(), 0);
      await page.getByRole("button", { name: "재설치 내용 확인", exact: true }).click();
    } else {
      await page.getByRole("heading", { name: "이 설치본에 적용할 업데이트가 있습니다", exact: true }).waitFor();
    }
    const apply = page.getByRole("button", { name: label, exact: true });
    assert.equal(await apply.isDisabled(), true, "Replacing files must require fresh consent");
    assert.deepEqual(filesOnly(await snapshot(page)), filesOnly(fixture.files), "Connecting/comparing must not write files");
    // Read an actual expanded diff, then close/reopen to exercise the saved handle
    // and ensure approval does not survive reopening the manager.
    await page.locator("details").filter({ has: page.locator("summary", { hasText: "SKILL.md" }) }).locator("summary").click();
    await page.getByRole("checkbox").check();
    assert.equal(await apply.isEnabled(), true);
    await apply.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, fixture.name + "-review.png") });
    if (!fixture.custom) {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "설치된 스킬 등록·관리", exact: true }).click();
      await apply.waitFor();
      assert.equal(await apply.isDisabled(), true);
      await page.getByRole("checkbox").check();
    }
    await apply.click();
    await page.getByRole("heading", { name: "이 앱에 동봉된 스킬과 일치합니다", exact: true }).waitFor();
    assert.deepEqual(filesOnly(await snapshot(page)), filesOnly(bundle.files));
    assert.equal(await page.getByRole("button", { name: "백업 후 스킬 업데이트", exact: true }).count(), 0);
    await page.screenshot({ path: resolve(output, fixture.name + "-applied.png") });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "백업 내보내기", exact: true }).click();
    const backupPath = resolve(output, fixture.name + "-backup.json");
    await (await download).saveAs(backupPath);
    const backup = JSON.parse(await readFile(backupPath, "utf8"));
    assert.equal(backup.state, "applied");
    assert.equal(backup.operation, fixture.custom ? "reinstall" : "update");
    assert.deepEqual(filesOnly(backup.before), filesOnly(fixture.files));
    assert.deepEqual(filesOnly(backup.intended), filesOnly(bundle.files));
    for (const file of [...backup.before, ...backup.intended]) assert.equal(sha256(file.content), file.sha256);
    await page.getByRole("button", { name: "백업 복원", exact: true }).click();
    assert.deepEqual(filesOnly(await snapshot(page)), filesOnly(bundle.files), "Opening restore confirmation must not write files");
    await page.getByRole("button", { name: "확인 후 복원", exact: true }).click();
    await page.getByText("원본 스킬 파일을 복원하고 검증했습니다.", { exact: true }).waitFor();
    assert.deepEqual(filesOnly(await snapshot(page)), filesOnly(fixture.files));
    await page.getByRole("button", { name: "연결 해제", exact: true }).click();
    await page.getByRole("button", { name: "폴더 선택", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "백업 내보내기", exact: true }).count(), 1);
    assert.deepEqual(filesOnly(await snapshot(page)), filesOnly(fixture.files));
    assert.deepEqual(errors, []);
    pass(`${fixture.name}: compare without writes, fresh confirmation, exact replacement, full backup, explicit restore and backup retention`);
  } catch (error) {
    await page?.screenshot({ path: resolve(output, fixture.name + "-failure.png") }).catch(() => {});
    throw error;
  } finally { await context.close(); page = undefined; }
}

try {
  if (!origin) {
    const directory = resolve(root, values.dir);
    const headers = await readFile(resolve(directory, "_headers"), "utf8");
    const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1];
    const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".zip": "application/zip" };
    server = createServer(async (request, response) => {
      let path = new URL(request.url, "http://local").pathname.slice(1);
      if (!path || /^(about|intro|releases(?:\/[^/.]+)?)\/?$/.test(path)) path = "index.html";
      const file = resolve(directory, path);
      if (!file.startsWith(directory + sep)) { response.writeHead(400).end(); return; }
      try {
        const bytes = await readFile(file);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
        if (csp) response.setHeader("Content-Security-Policy", csp);
        response.end(bytes);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  report.origin = origin;
  const get = async (path) => (await exec("curl", ["--fail", "--silent", "--show-error", "--max-time", "30", origin + path], { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 })).stdout;
  const release = JSON.parse(await get("/release.json"));
  report.release = release;
  assert.equal(release.history.at(-1).skill?.compatibility, "compatible", "The actual authored release must approve skill compatibility; never substitute smoke notes");
  const payload = await get(`/downloads/implementation-ledger-${release.skillBundle}.json`);
  assert.equal(sha256(payload), release.skillPayload);
  const bundle = JSON.parse(payload);
  assert.equal(bundle.version, release.skillBundle);
  for (const file of bundle.files) assert.equal(sha256(file.content), file.sha256);
  const archive = await get(`/downloads/implementation-ledger-${release.skillBundle}.zip`);
  assert.equal(sha256(archive), release.skillArchive);
  const entries = unzipSync(archive);
  assert.deepEqual(Object.keys(entries).filter((path) => path.startsWith("implementation-ledger/")).sort(), bundle.files.map(({ path }) => "implementation-ledger/" + path).sort());
  for (const file of bundle.files) assert.equal(sha256(entries["implementation-ledger/" + file.path]), file.sha256);
  pass("Actual release, pinned payload and archive hashes agree (no compatibility or network overrides)");
  report.source = bundle.source;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  report.chrome = browser.version();
  const fixtures = [];
  for (const known of bundle.known) {
    assert.match(known.source, /^[a-f0-9]{40}$/);
    const files = [];
    for (const file of known.files) {
      assert(!file.path.startsWith("/") && !file.path.split("/").includes(".."));
      const { stdout: content } = await exec("git", ["show", `${known.source}:skills/implementation-ledger/${file.path}`], { cwd: root });
      assert.equal(sha256(content), file.sha256, "Fixture must match the exact official snapshot");
      files.push({ path: file.path, content });
    }
    fixtures.push({ name: known.source.slice(0, 12), files });
  }
  assert(fixtures.length, "At least one known official source must be exercised");
  fixtures.push({ name: "modified-installation", custom: true, files: [...fixtures.at(-1).files, { path: "personal-notes.md", content: "# Synthetic customization\nPreserve this in the backup.\n" }] });
  for (const fixture of fixtures) await checkInstallation(fixture, bundle);
} catch (error) { failure = error; report.failure = error.stack; }
finally {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Evidence:", output);
}
if (failure) throw failure;
