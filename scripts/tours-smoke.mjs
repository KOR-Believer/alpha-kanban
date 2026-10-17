import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = process.env.TOUR_SMOKE_URL ?? "http://127.0.0.1:5187";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) throw new Error("Use a local preview for tour smoke.");
const output = resolve("output/playwright/tours-" + Date.now());
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
const results = [];
page.on("pageerror", (error) => errors.push(error.message));
const record = (name) => { results.push(name); console.log("PASS", name); };
const popup = () => page.locator(".ak-screen-tour");
const next = () => popup().locator(".driver-popover-next-btn").click();
const title = () => popup().locator(".driver-popover-title").innerText();
const offer = () => page.locator("[data-tour-offer]");
async function waitGone(selector) { await page.locator(selector).waitFor({ state: "detached" }); }
async function replay(owner = page) {
  await owner.getByRole("button", { name: "화면 둘러보기", exact: true }).click();
  await owner.locator(".ak-screen-tour").waitFor();
}
async function finishTour(name, titles, owner = page) {
  const surface = owner.locator(".ak-screen-tour");
  for (const [index, expected] of titles.entries()) {
    assert.equal(await surface.locator(".driver-popover-title").innerText(), expected);
    assert.equal(await surface.locator(".driver-popover-progress-text").innerText(), `${index + 1} / ${titles.length}`);
    await bounds(`${name}-${index + 1}`, owner);
    await surface.locator(".driver-popover-next-btn").click();
  }
  await surface.waitFor({ state: "detached" });
}
const startTitles = ["프로젝트 하나 열기", "여러 프로젝트 함께 연결하기", "새 프로젝트 폴더 만들기", "프로젝트 찾고 다시 열기", "다음에 열 화면 정하기", "연결한 워크스페이스 관리하기", "AI 도구에 스킬 준비하기", "대화에서 구현까지 이어가기"];
const projectTitles = ["현재 프로젝트 전환하기", "필요한 문서 찾기", "문서 목록 간추리기", "문서 정렬 바꾸기", "보드와 Markdown 전환하기", "상태별로 진행 상황 보기", "티켓 상세 확인하기", "프로젝트를 모아서 보기", "폴더 접근과 편집 권한 관리하기"];
const allTitles = ["보고 싶은 프로젝트 고르기", "여러 프로젝트에서 티켓 찾기", "남은 작업에 집중하기", "상태별로 진행 상황 보기", "티켓 상세 확인하기", "프로젝트 보드로 이어가기", "파일 변경 없이 카드 정렬하기", "폴더 접근과 편집 권한 관리하기"];
const detailTitles = ["편한 크기로 상세 보기", "작업 범위부터 확인하기", "완료 기준과 검증 확인하기", "사유와 함께 상태 변경하기", "필요할 때 지시 남기기", "작업 결과와 이력 읽기"];
async function bounds(name, owner = page) {
  const surface = owner.locator(".ak-screen-tour");
  await surface.waitFor();
  const geometry = await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, rect: rect.toJSON(),
      controls: [...element.querySelectorAll("button")].filter((button) => button.offsetWidth).map((button) => ({ text: button.textContent, rect: button.getBoundingClientRect().toJSON(), font: getComputedStyle(button).fontFamily })),
      focused: element.contains(document.activeElement),
    };
  });
  assert(geometry.rect.left >= 0 && geometry.rect.right <= geometry.width && geometry.rect.top >= 0 && geometry.rect.bottom <= geometry.height, name + " viewport bounds");
  for (const control of geometry.controls) {
    assert.equal(control.rect.height, 28, name + " shared small-button height");
    assert(control.rect.left >= geometry.rect.left && control.rect.right <= geometry.rect.right, name + " control bounds");
    assert(control.font.includes("Pretendard"), "theme font stack");
  }
  await owner.screenshot({ path: resolve(output, name + ".png") });
  return geometry;
}
async function readGuide(name, owner = page) {
  const url = owner.url();
  await owner.getByRole("button", { name: "사용 안내", exact: true }).click();
  await owner.getByRole("button", { name: "AI와 문서로 작업하기", exact: true }).click();
  const guide = owner.getByRole("dialog", { name: "AI와 문서로 작업하기", exact: true });
  await guide.waitFor();
  assert.equal(await guide.locator(".ak-guide-step").count(), 7);
  assert.equal(owner.url(), url);
  const geometry = await guide.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const body = element.querySelector(".ak-scroll-area");
    return { rect: rect.toJSON(), width: innerWidth, height: innerHeight, bodyHeight: body.clientHeight, bodyScroll: body.scrollHeight, bodyWidth: body.clientWidth, bodyScrollWidth: body.scrollWidth };
  });
  assert(geometry.rect.left >= 0 && geometry.rect.right <= geometry.width && geometry.rect.top >= 0 && geometry.rect.bottom <= geometry.height, name + " dialog bounds");
  assert(geometry.bodyScroll > geometry.bodyHeight, name + " scrolls inside dialog");
  assert(geometry.bodyScrollWidth <= geometry.bodyWidth, name + " text stays inside dialog");
  await owner.screenshot({ path: resolve(output, name + ".png") });
  await guide.getByRole("button", { name: "설치 요청문 확인·복사", exact: true }).click();
  const installation = owner.getByRole("dialog", { name: "Codex에 전달할 설치 요청", exact: true });
  await installation.waitFor();
  await owner.keyboard.press("Escape");
  await installation.waitFor({ state: "detached" });
  assert(await guide.isVisible(), name + " nested installation dialog returns to guide");
  await guide.locator(".ak-guide-step").last().scrollIntoViewIfNeeded();
  await owner.keyboard.press("Escape");
  await guide.waitFor({ state: "detached" });
  await owner.waitForFunction(() => document.activeElement?.hasAttribute("data-tour-help"));
  assert.equal(owner.url(), url);
}
const fixture = `# Screen tour fixture

## Status

- 현재 진행률: 0 / 1 tickets

## Ticket List

### TOUR-01. Read a ticket without editing it

Status: READY
Progress: 25%
Repository:

- tour-fixture

Priority: P1
Type: Feature
Depends on:

- 없음

목표:

- Tour fixture

현재 문제:

- Test only

구현 범위:

- Read-only walkthrough

제외 범위:

- 실제 사용자 문서

완료 기준:

- [ ] Verify

검증:

- [ ] Verify

사용자 지시:

진행 메모:
`;
async function original() {
  return page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle("tour-fixture");
    return (await (await (await folder.getDirectoryHandle("docs")).getFileHandle("01_tour_tickets.md")).getFile()).text();
  });
}
let failure;
try {
  await page.goto(origin);
  await offer().waitFor();
  assert.equal(await popup().count(), 0);
  await readGuide("usage-guide-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await readGuide("usage-guide-narrow");
  await page.setViewportSize({ width: 1360, height: 900 });
  assert.equal(await offer().count(), 1);
  record("AI guide opens visibly on start without navigation, at desktop and narrow widths");
  await offer().getByRole("button", { name: "건너뛰기", exact: true }).click();
  await page.reload(); await page.getByText("아직 최근 프로젝트가 없습니다.", { exact: true }).waitFor();
  assert.equal(await offer().count(), 0);
  await replay();
  assert.equal(await title(), "프로젝트 하나 열기");
  await bounds("start-desktop");
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    assert(await popup().evaluate((element) => element.contains(document.activeElement)), "keyboard focus stays in tour");
  }
  await page.keyboard.press("ArrowRight");
  assert.equal(await title(), "여러 프로젝트 함께 연결하기");
  await page.keyboard.press("Escape"); await waitGone(".ak-screen-tour");
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-tour-replay"));
  await replay(); await finishTour("start-desktop", startTitles);
  assert.equal(await page.evaluate(() => localStorage.getItem("alpha-kanban.tours.v1.start")), "completed");
  assert(await page.getByRole("button", { name: "화면 둘러보기", exact: true }).isVisible());
  record("eight-step empty start, skip/revisit/direct replay/finish, keyboard focus and theme");

  await page.setViewportSize({ width: 390, height: 844 });
  await replay(); await finishTour("start-narrow", startTitles);
  await page.setViewportSize({ width: 1360, height: 900 });
  record("narrow-screen targets and controls stay inside viewport");

  await page.evaluate(async (fixture) => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle("tour-fixture", { create: true });
    const file = await (await folder.getDirectoryHandle("docs", { create: true })).getFileHandle("01_tour_tickets.md", { create: true });
    const write = await file.createWritable(); await write.write(fixture); await write.close();
    const notes = await folder.getFileHandle("notes.md", { create: true });
    const notesWrite = await notes.createWritable(); await notesWrite.write("# Plain Markdown\n\nRead without a board."); await notesWrite.close();
    window.showDirectoryPicker = async () => folder;
  }, fixture);
  await page.getByRole("button", { name: "프로젝트 열기", exact: true }).click();
  await page.getByText("Read a ticket without editing it", { exact: true }).waitFor();
  const projectUrl = page.url();
  await offer().getByRole("button", { name: "화면 둘러보기", exact: true }).click();
  await finishTour("project-desktop", projectTitles);
  assert.equal(await original(), fixture);
  assert.equal(await page.evaluate(() => localStorage.getItem("alpha-kanban.tours.v1.project")), "completed");
  record("nine-step populated project board completes without changing Markdown");

  await page.getByRole("button", { name: "사용 안내", exact: true }).click();
  await page.getByRole("button", { name: "보드 안내 다시 보기", exact: true }).click();
  await popup().waitFor();
  assert.equal(await title(), "현재 프로젝트 전환하기");
  await page.setViewportSize({ width: 390, height: 844 });
  await finishTour("project-narrow", projectTitles);
  await replay();
  for (let index = 0; index < 6; index++) await next();
  await page.evaluate(() => {
    localStorage.setItem("alpha-kanban.locale", "en");
    window.dispatchEvent(new StorageEvent("storage", { key: "alpha-kanban.locale", newValue: "en" }));
  });
  await page.getByText("Open a ticket for the details", { exact: true }).waitFor();
  await bounds("board-narrow-english");
  await page.keyboard.press("Escape"); await waitGone(".ak-screen-tour");
  await page.evaluate(() => {
    localStorage.setItem("alpha-kanban.locale", "ko");
    window.dispatchEvent(new StorageEvent("storage", { key: "alpha-kanban.locale", newValue: "ko" }));
  });
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.locator('[data-tour="board-card"] button').click();
  const draft = page.locator('[role="dialog"] form textarea').last();
  await draft.fill("Keep my draft");
  assert.equal(await popup().count(), 0); assert.equal(await offer().count(), 0);
  const detail = page.locator(".ak-ticket-detail-shell");
  for (const mode of ["side", "modal", "full"]) {
    await detail.getByRole("button", { name: "티켓 보기 방식", exact: true }).click();
    const labels = { side: "사이드 패널", modal: "중앙 창", full: "전체 화면" };
    await page.getByRole("button", { name: labels[mode], exact: true }).click();
    assert.equal(await detail.getAttribute("data-mode"), mode);
    await detail.getByRole("button", { name: "상세 둘러보기", exact: true }).click();
    await finishTour(`detail-${mode}`, detailTitles);
    assert.equal(await draft.inputValue(), "Keep my draft");
    assert(await detail.isVisible());
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await detail.getByRole("button", { name: "상세 둘러보기", exact: true }).click();
  await finishTour("detail-narrow", detailTitles);
  await detail.getByRole("button", { name: "상세 둘러보기", exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    assert(await popup().evaluate((element) => element.contains(document.activeElement)), "detail tour owns keyboard focus");
  }
  await page.keyboard.press("Escape"); await waitGone(".ak-screen-tour");
  assert(await detail.isVisible());
  assert.equal(await draft.inputValue(), "Keep my draft");
  assert.equal(await original(), fixture);
  await page.setViewportSize({ width: 1360, height: 900 });
  record("contextual detail tours in side/center/full/narrow views preserve drafts and Escape leaves the ticket open");

  // A new page leaves the unsaved test draft alone instead of confirming a discard.
  const all = await context.newPage();
  await all.goto(origin + "/all");
  await all.locator('[data-tour="board-card"]').waitFor();
  assert.equal(await all.locator("[data-tour-offer]").count(), 1);
  await readGuide("all-usage-guide", all);
  await all.getByRole("button", { name: "사용 안내", exact: true }).click();
  await all.getByRole("button", { name: "화면 안내 다시 보기", exact: true }).click();
  await all.locator(".ak-screen-tour").waitFor();
  await finishTour("all-desktop", allTitles, all);
  await all.reload(); await all.locator('[data-tour="board-card"]').waitFor();
  assert.equal(await all.locator("[data-tour-offer]").count(), 0);
  await all.setViewportSize({ width: 390, height: 844 });
  await replay(all); await finishTour("all-narrow", allTitles, all);
  await all.locator('[data-tour="board-card"] > a').click();
  const allDetail = all.locator(".ak-ticket-detail-shell");
  await allDetail.waitFor();
  for (const language of ["en", "ko"]) {
    await all.evaluate((language) => {
      localStorage.setItem("alpha-kanban.locale", language);
      window.dispatchEvent(new StorageEvent("storage", { key: "alpha-kanban.locale", newValue: language }));
    }, language);
    await allDetail.getByRole("button", { name: language === "en" ? "Tour ticket details" : "상세 둘러보기", exact: true }).waitFor();
    const toolbarFits = await allDetail.locator(".ak-ticket-detail-toolbar").evaluate((element) => {
      const frame = element.getBoundingClientRect();
      return [...element.querySelectorAll("button")].every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left >= frame.left && rect.right <= frame.right && rect.top >= frame.top && rect.bottom <= frame.bottom;
      });
    });
    assert(toolbarFits, `all-project detail toolbar controls fit narrow viewport in ${language}`);
    await all.screenshot({ path: resolve(output, `all-detail-toolbar-${language}.png`) });
  }
  await allDetail.getByRole("button", { name: "상세 둘러보기", exact: true }).click();
  await finishTour("all-detail-narrow", detailTitles, all);
  await all.keyboard.press("Escape"); await allDetail.waitFor({ state: "detached" });
  await all.getByRole("textbox", { name: "티켓 검색", exact: true }).fill("no-matching-ticket");
  await all.locator('[data-tour="board-card"]').waitFor({ state: "detached" });
  await replay(all);
  await finishTour("all-empty-search", allTitles.filter((_, index) => ![4, 5, 6].includes(index)), all);
  assert.equal(await all.getByRole("textbox", { name: "티켓 검색", exact: true }).inputValue(), "no-matching-ticket");
  await all.close();
  assert.equal(await draft.inputValue(), "Keep my draft");
  record("eight-step all-projects tour has independent first-use state and adapts to empty search without changing filters or another window draft");

  const direct = await context.newPage();
  await direct.goto(origin);
  await direct.getByRole("button", { name: /tour-fixture/ }).waitFor();
  await direct.evaluate(() => localStorage.removeItem("alpha-kanban.tours.v1.start"));
  await direct.reload(); await direct.getByRole("button", { name: /tour-fixture/ }).waitFor();
  assert.equal(await direct.locator("[data-tour-offer]").count(), 0);
  await replay(direct); await finishTour("start-connected", startTitles, direct);
  await direct.goto(new URL(projectUrl).origin + new URL(projectUrl).pathname + "?view=guide");
  await direct.locator(".ak-project-guide").waitFor();
  await replay(direct);
  const guideTitles = projectTitles.filter((_, index) => ![4, 5, 6].includes(index));
  guideTitles.splice(4, 0, "첫 플랜과 티켓 만들기");
  await finishTour("project-guide", guideTitles, direct);
  await direct.locator('aside button[title="notes.md"]').click();
  await direct.locator(".ak-markdown").waitFor();
  const markdownUrl = direct.url();
  await replay(direct);
  await finishTour("project-plain-markdown", projectTitles.filter((_, index) => ![4, 5, 6].includes(index)), direct);
  assert.equal(direct.url(), markdownUrl);
  assert(await direct.locator(".ak-markdown").isVisible());
  await direct.close();
  record("connected start, project guide, and ordinary Markdown have manual context tours without navigation or requiring a ticket card");
  assert.deepEqual(errors, []);
  console.log("Artifacts", output, "Project", projectUrl);
} catch (error) {
  failure = error; console.error(error);
  await page.screenshot({ path: resolve(output, "failure.png") }).catch(() => {});
} finally {
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, errors, failure: failure?.stack, chrome: browser.version() }, null, 2));
  await context.close(); await browser.close();
}
if (failure) process.exitCode = 1;
