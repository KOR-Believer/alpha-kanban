import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// Run against a local production preview. The CSS optimizer is part of this
// regression: happy-dom and an uncompiled dev stylesheet cannot reproduce it.
const origin = process.env.TOUR_SMOKE_URL ?? "http://127.0.0.1:4187";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = resolve("output/playwright/skill-tour-" + Date.now());
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await context.addInitScript(() => localStorage.setItem("alpha-kanban.locale", "en"));
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [], checks = [];
page.on("pageerror", error => errors.push(error.message));
const dialog = () => page.locator(".ak-resizable-dialog");
const tour = () => page.locator(".ak-screen-tour");
const current = () => tour().locator(".driver-popover-title").innerText();
const pass = name => { checks.push(name); console.log("PASS", name); };

async function geometry(name, screenshot = false) {
  await page.waitForFunction(() => {
    const svg = document.querySelector(".driver-overlay"), target = document.querySelector(".driver-active-element");
    if (!svg || !target) return false;
    const host = document.querySelector(".ak-resizable-dialog"), panel = host.getBoundingClientRect();
    if (host.dataset.mode === "modal" && (Math.abs(panel.left - (document.documentElement.getBoundingClientRect().width - panel.width) / 2) > 1 || Math.abs(panel.top - (innerHeight - panel.height) / 2) > 1)) return false;
    const matrix = svg.getScreenCTM(), rect = target.getBoundingClientRect();
    const path = svg.querySelector("path").getAttribute("d");
    const cutout = path.match(/Z\s*M([\d.-]+),([\d.-]+) h[\d.-]+ a([\d.-]+)/);
    if (!cutout) return false;
    const point = new DOMPoint(Number(cutout[1]), Number(cutout[2])).matrixTransform(matrix);
    return Math.abs(point.x - (rect.left - 4 + Number(cutout[3]))) < 1 && Math.abs(point.y - (rect.top - 4)) < 1;
  });
  const bounds = await page.evaluate(() => {
    const svg = document.querySelector(".driver-overlay"), popover = document.querySelector(".driver-popover");
    const host = document.querySelector(".ak-resizable-dialog"), target = document.querySelector(".driver-active-element");
    const matrix = svg.getScreenCTM();
    const clip = { top: 0, bottom: innerHeight };
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
        const rect = parent.getBoundingClientRect();
        clip.top = Math.max(clip.top, rect.top); clip.bottom = Math.min(clip.bottom, rect.bottom);
      }
    }
    return { host: host.getBoundingClientRect().toJSON(), target: target.getBoundingClientRect().toJSON(),
      popover: popover.getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight,
      matrix: [matrix.a, matrix.d, matrix.e, matrix.f], transform: getComputedStyle(host).transform,
      inside: host.contains(svg) && host.contains(popover), clip,
    };
  });
  assert.deepEqual(bounds.matrix, [1, 1, 0, 0], name + ": viewport coordinates have no dialog offset or scale");
  assert.equal(bounds.transform, "none"); assert(bounds.inside, name + ": Radix focus boundary retained");
  if (bounds.target.height < bounds.clip.bottom - bounds.clip.top) assert(bounds.target.top >= bounds.clip.top - 1 && bounds.target.bottom <= bounds.clip.bottom + 1, name + ": resized target remains visible within its scroll region");
  const rect = bounds.popover;
  assert(rect.left >= -1 && rect.top >= -1 && rect.right <= bounds.width + 1 && rect.bottom <= bounds.height + 1, name + ": explanation stays inside viewport");
  if (screenshot) await page.screenshot({ path: resolve(output, name + ".png") });
  pass(name);
  return bounds;
}

async function files() {
  return page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("implementation-ledger");
    const result = [];
    async function walk(dir, prefix = "") {
      for await (const entry of dir.values()) {
        if (entry.kind === "directory") await walk(entry, prefix + entry.name + "/");
        else result.push([prefix + entry.name, await (await entry.getFile()).text()]);
      }
    }
    await walk(root); return result.sort(([a], [b]) => a.localeCompare(b));
  });
}

try {
  await page.goto(origin + "/about#updates");
  assert.match(await page.locator('script[type="module"]').getAttribute("src"), /^\/assets\//, "Use a compiled production preview");
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Register or manage an installed skill", exact: true }).click();
  await page.getByRole("button", { name: "Tour this dialog", exact: true }).click();
  await geometry("unconnected", true);
  await tour().locator(".driver-popover-close-btn").click();

  // A genuine old official bundle makes the comparison and consent visible.
  // Only the chooser is substituted, with an isolated OPFS directory.
  const release = JSON.parse(await readFile("apps/web/dist-browser/release.json", "utf8"));
  const bundle = JSON.parse(await readFile(`apps/web/dist-browser/downloads/implementation-ledger-${release.skillBundle}.json`, "utf8"));
  const known = bundle.known.at(-1);
  const fixture = known.files.map(file => ({ path: file.path, content: execFileSync("git", ["show", `${known.source}:skills/implementation-ledger/${file.path}`], { encoding: "utf8" }) }));
  await page.evaluate(async fixture => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("implementation-ledger", { create: true });
    for (const file of fixture) {
      const parts = file.path.split("/"), name = parts.pop(); let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(file.content); await writable.close();
    }
    window.showDirectoryPicker = async () => root;
  }, fixture);
  await page.getByRole("button", { name: "Choose folder", exact: true }).click();
  await page.getByRole("heading", { name: "An update is available for this installation", exact: true }).waitFor();
  const before = await files();
  await page.getByRole("checkbox").check();
  await page.locator("details").filter({ has: page.locator("summary", { hasText: "SKILL.md" }) }).locator("summary").click();
  const consent = page.getByRole("checkbox");
  const diff = page.locator(".ak-code-diff").first();
  await diff.waitFor();
  await page.getByRole("button", { name: "Tour this dialog", exact: true }).click();
  await geometry("connected-centered", true);
  const firstTitle = await current();
  const beforeResize = await dialog().boundingBox();
  const handle = dialog().locator('[data-edge="bottom-right"]');
  const corner = await handle.boundingBox();
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x - 100, corner.y - 80, { steps: 8 });
  await geometry("during-drag");
  await page.mouse.up();
  assert((await dialog().boundingBox()).width < beforeResize.width - 100);
  assert.equal(await current(), firstTitle);
  await geometry("resized-dialog", true);
  await handle.press("ArrowRight");
  assert.equal(await current(), firstTitle, "Resizing arrows must not advance the tour");
  await geometry("keyboard-resize");
  const resizedCorner = await handle.boundingBox();
  await page.mouse.move(resizedCorner.x + resizedCorner.width / 2, resizedCorner.y + resizedCorner.height / 2);
  await page.mouse.down();
  await page.locator('.ak-resizable-dialog[data-resizing="true"]').waitFor();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await dialog().getAttribute("data-resizing"), null);
  assert.equal(await current(), firstTitle, "Escape ends an active resize before dismissing the tour");
  await geometry("escape-ends-resize");
  await dialog().getByRole("button", { name: "Expand dialog", exact: true }).click();
  await geometry("maximized", true);
  assert.equal(await current(), firstTitle);
  await dialog().getByRole("button", { name: "Restore dialog size", exact: true }).click();
  await geometry("restored");
  await dialog().getByRole("button", { name: "Reset size", exact: true }).click();
  await geometry("reset-size");

  // Verify the later scrolled step too, not just the first target at the top.
  await tour().locator(".driver-popover-next-btn").click();
  const secondTitle = await current();
  for (const [width, height] of [[2560, 1235], [800, 600], [390, 844], [640, 360], [1360, 900]]) {
    await page.setViewportSize({ width, height });
    await geometry(`viewport-${width}x${height}`, true);
    assert.equal(await current(), secondTitle, "Viewport resize keeps the current step");
  }
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await geometry("dark", true);
  const anchor = await page.locator(".driver-active-element").getAttribute("data-tour");
  for (const language of ["ko", "en"]) {
    await page.evaluate(language => {
      localStorage.setItem("alpha-kanban.locale", language);
      window.dispatchEvent(new StorageEvent("storage", { key: "alpha-kanban.locale", newValue: language }));
    }, language);
    await page.waitForFunction(language => document.documentElement.lang === language, language);
    await page.setViewportSize(language === "ko" ? { width: 390, height: 844 } : { width: 1360, height: 900 });
    await geometry(`language-${language}`, true);
    assert.equal(await page.locator(".driver-active-element").getAttribute("data-tour"), anchor);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
    assert(await tour().evaluate(element => element.contains(document.activeElement)));
  }
  await tour().locator(".driver-popover-next-btn").click();
  await geometry("comparison");
  await tour().locator(".driver-popover-next-btn").click();
  await geometry("consent", true);
  assert.equal(await consent.getAttribute("aria-checked"), "true");
  const apply = await page.locator('[data-tour="skill-apply"]').boundingBox();
  await page.mouse.click(apply.x + apply.width / 2, apply.y + apply.height / 2);
  assert.equal(await current(), "Approve each update", "Highlighted file actions stay blocked");
  await page.keyboard.press("Escape");
  await tour().waitFor({ state: "detached" });
  assert.equal(await dialog().getAttribute("data-tour-positioned"), null);
  assert.equal(await consent.getAttribute("aria-checked"), "true");
  assert(await diff.isVisible());
  assert.deepEqual(await files(), before, "No skill file writes");
  assert.deepEqual(errors, []);
  pass("Same review, expanded diff and consent survive; Tab stays in the tour; Escape restores the dialog; files unchanged");
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify({ origin, checks, errors }, null, 2));
  await browser.close();
  console.log("Evidence:", output);
}
