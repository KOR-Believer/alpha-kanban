import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// UI regression against a local production preview. A synthetic completed
// journal and OPFS skill keep every user's real connections and files untouched.
const origin = process.env.SKILL_NOTICE_SMOKE_URL ?? "http://127.0.0.1:4187";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = resolve("output/playwright/skill-notice-" + Date.now());
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await context.addInitScript(origin => {
  if (location.origin === origin) localStorage.setItem("alpha-kanban.locale", "ko");
}, origin);
const page = await context.newPage();
const checks = [], errors = [];
context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
page.on("pageerror", error => errors.push(error.message));
const pass = name => { checks.push(name); console.log("PASS", name); };
const notice = page => page.locator("aside").filter({ hasText: "등록된 스킬을 백업하고 업데이트했습니다." });

async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("alpha-kanban.browser.v1", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const get = key => new Promise((resolve, reject) => {
      const request = db.transaction("records").objectStore("records").get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const update = await get("skill-update:app-update");
    const backup = await get("skill-update:recovery:notice-smoke-backup");
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle("implementation-ledger");
    const file = await (await folder.getFileHandle("SKILL.md")).getFile();
    const content = await file.text();
    db.close();
    return { update, before: backup.before, intended: backup.intended, state: backup.state, content, mtime: file.lastModified };
  });
}

try {
  await page.goto(origin + "/about");
  assert.match(await page.locator('script[type="module"]').getAttribute("src"), /^\/assets\//);
  await page.evaluate(async () => {
    const release = await (await fetch("/release.json")).json();
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("implementation-ledger", { create: true });
    const content = "---\nname: implementation-ledger\ndescription: Synthetic notification smoke\n---\nUpdated synthetic instructions\n";
    const file = await root.getFileHandle("SKILL.md", { create: true });
    const writable = await file.createWritable(); await writable.write(content); await writable.close();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const intended = [{ path: "SKILL.md", content, sha256: digest }];
    const connection = { id: "notice-smoke-skill", name: root.name, handle: root };
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("alpha-kanban.browser.v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("records");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("records", "readwrite");
      const store = transaction.objectStore("records");
      store.put(connection, "skill-update:connection");
      store.put({ id: "notice-smoke-backup", connection, before: [{ ...intended[0], mtime: 1 }], intended, state: "applied", createdAt: new Date().toISOString() }, "skill-update:recovery:notice-smoke-backup");
      store.put({ id: "notice-smoke-completed", fromBuild: "0".repeat(16), buildId: release.buildId, version: release.skillBundle, digest: release.skillPayload, connectionId: connection.id, files: [], state: "applied", recoveryId: "notice-smoke-backup" }, "skill-update:app-update");
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  const before = await snapshot(page);
  await page.reload(); await notice(page).waitFor();
  const second = await context.newPage(); await second.goto(origin + "/about"); await notice(second).waitFor();
  await page.screenshot({ path: resolve(output, "completed-notice.png") });
  await notice(page).getByRole("button", { name: "스킬 업데이트", exact: true }).click();
  await page.getByRole("heading", { name: "스킬 업데이트", exact: true }).waitFor();
  await notice(second).waitFor({ state: "detached" });
  await page.locator(".ak-resizable-dialog").getByRole("button", { name: "닫기", exact: true }).last().click();
  await notice(page).waitFor({ state: "detached" });
  pass("Opening skill management acknowledges the notice; closing it does not restore the toast; another open window clears it");
  await page.goto(origin + "/docs/updates"); await page.goto(origin + "/about");
  await page.reload(); await second.reload();
  const third = await context.newPage(); await third.goto(origin + "/about");
  for (const tab of [page, second, third]) {
    await tab.locator(".ak-intro-page").waitFor();
    await tab.waitForTimeout(300);
    assert.equal(await notice(tab).count(), 0);
  }
  const after = await snapshot(page);
  assert.deepEqual(after, { ...before, update: { ...before.update, acknowledged: true } });
  pass("Route remount, reload and a new window keep it acknowledged; installed bytes and the original backup are unchanged");
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open("alpha-kanban.browser.v1", 1); request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("records", "readwrite"), store = transaction.objectStore("records");
      const request = store.get("skill-update:app-update");
      request.onsuccess = () => store.put({ ...request.result, id: "next-completed-update", acknowledged: false }, "skill-update:app-update");
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    }); db.close();
  });
  await page.reload(); await second.reload();
  await notice(page).waitFor(); await notice(second).waitFor();
  await notice(page).getByRole("button", { name: "닫기", exact: true }).click();
  await notice(page).waitFor({ state: "detached" }); await notice(second).waitFor({ state: "detached" });
  assert.equal((await snapshot(page)).update.acknowledged, true);
  assert.deepEqual(errors, []);
  pass("A later update still gets its own notice; X dismisses it durably across windows");
  await page.screenshot({ path: resolve(output, "acknowledged.png") });
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify({ origin, checks, errors }, null, 2));
  await browser.close(); console.log("Evidence:", output);
}
