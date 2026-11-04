// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PwaState } from "./client";
import type { ReleaseInfo } from "./releases";
import { setLanguage } from "../i18n";
import { appActivity } from "./activity";
import { openReleaseNotes, ReleaseCenter } from "./ReleaseCenter";
import { observeRelease, unreadReleases, wasNotified } from "./releases";
import type { PreparedSkillUpdate } from "../skills/useAppSkillUpdate";
import type { SkillReview } from "../skills/repository";

const mock = vi.hoisted(() => ({ path: "/", state: { status: "current", offlineReady: true } as PwaState, listeners: new Set<() => void>(), apply: vi.fn() }));
const skills = vi.hoisted(() => ({ state: "none" as PreparedSkillUpdate["state"], approve: vi.fn(), cancel: vi.fn(), error: "", review: undefined as SkillReview | undefined }));
vi.mock("@tanstack/react-router", () => ({ useLocation: () => mock.path }));
vi.mock("./client", () => ({ pwaClient: { getSnapshot: () => mock.state, subscribe: (listener: () => void) => { mock.listeners.add(listener); return () => mock.listeners.delete(listener); }, apply: mock.apply } }));
vi.mock("../skills/repository", async (original) => ({ ...await original<typeof import("../skills/repository")>(), skillRepository: { connection: async () => undefined, recoveries: async () => [] } }));
vi.mock("../skills/useAppSkillUpdate", () => ({ useAppSkillUpdate: (_: ReleaseInfo, target?: ReleaseInfo) => ({
  prepared: target ? { buildId: target.buildId, state: skills.state, review: skills.review, error: skills.error, repository: { approveAppUpdate: skills.approve, cancelAppUpdate: skills.cancel } } : undefined,
}) }));
function release(n: number): ReleaseInfo {
  const history = Array.from({ length: n }, (_, index) => ({ id: `notes-${index + 1}`, sequence: index + 1, date: "2026-10-26", notify: true, notes: { ko: [`릴리즈 ${index + 1}`], en: [`Release ${index + 1}`] } }));
  return { app: "alpha-kanban", mode: "app", protocol: 1, storageSchema: 1, buildId: String(n).repeat(16), skillBundle: "1234567890ab", skillVersion: null, documentFormat: null, releaseId: history.at(-1)!.id, history, notes: history.at(-1)!.notes };
}
let root: Root, container: HTMLDivElement;
let marker: HTMLDivElement;
async function render(value = release(2)) { await act(async () => root.render(<ReleaseCenter release={value} enabled />)); }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(1100); }); }
const dialog = () => document.querySelector('[role="dialog"]');
async function click(text: string) { await act(async () => { [...document.querySelectorAll("button")].find((button) => button.textContent === text)!.click(); }); }
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); mock.path = "/"; mock.state = { status: "current", offlineReady: true }; mock.apply.mockReset().mockResolvedValue(true);
  skills.state = "none"; skills.error = ""; skills.review = undefined;
  skills.approve.mockReset().mockResolvedValue("approval"); skills.cancel.mockReset().mockResolvedValue(undefined);
  await setLanguage("ko"); appActivity.resume();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  const held = new Set<string>();
  vi.spyOn(navigator, "locks", "get").mockReturnValue({ request: async (name: string, _: unknown, callback: (lock: object | null) => Promise<void>) => {
    if (held.has(name)) return callback(null);
    held.add(name); try { return await callback({}); } finally { held.delete(name); }
  } } as unknown as LockManager);
  container = document.createElement("div"); marker = document.createElement("div"); marker.dataset.releaseStart = "ready";
  document.body.append(container, marker); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); marker.remove();
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
describe("release reading timing", () => {
  it("does not show retrospective notes on a first visit", async () => {
    await render(); await tick(); expect(dialog()).toBeNull();
  });
  it.each(["/intro", "/all", "/w/project"])("does not automatically interrupt %s", async (path) => {
    observeRelease(release(1)); mock.path = path; await render(); await tick();
    expect(dialog()).toBeNull(); expect(unreadReleases(release(2))).toHaveLength(1);
  });
  it("waits for the real selector, dialogs and drafts, then marks only read notes", async () => {
    observeRelease(release(1)); marker.removeAttribute("data-release-start");
    const draft = {}; appActivity.setDraft(draft, true);
    await render(); await tick(); expect(dialog()).toBeNull();
    marker.dataset.releaseStart = "ready"; await tick(); expect(dialog()).toBeNull();
    appActivity.setDraft(draft, false);
    const other = document.createElement("div"); other.setAttribute("role", "dialog"); document.body.append(other);
    await tick(); expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    other.remove(); await tick();
    expect(dialog()?.textContent).toContain("릴리즈 2");
    expect(unreadReleases(release(2))).toHaveLength(1);
    await click("닫기"); expect(unreadReleases(release(2))).toHaveLength(0);
    await tick(); expect(dialog()).toBeNull();
  });
  it.each(["tour", "invitation", "listbox", "input"])("defers automatic reading while %s owns the screen", async (kind) => {
    observeRelease(release(1));
    const blocker = document.createElement(kind === "input" ? "input" : "div");
    if (kind === "tour") blocker.className = "driver-overlay";
    if (kind === "invitation") blocker.dataset.tourOffer = "";
    if (kind === "listbox") blocker.setAttribute("role", "listbox");
    document.body.append(blocker);
    if (kind === "input") blocker.focus();
    try {
      await render(); await tick(); expect(dialog()).toBeNull();
      blocker.remove(); await tick(); expect(dialog()?.textContent).toContain("릴리즈 2");
    } finally { blocker.remove(); }
  });
  it("offers waiting B, not remote C, without marking notice dismissal as read", async () => {
    observeRelease(release(1)); mock.path = "/intro";
    mock.state = { status: "checking", offlineReady: true, next: release(3), prepared: release(2) };
    await render(release(1)); await tick();
    expect(wasNotified(release(2))).toBe(true);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="닫기"]')!.click());
    expect(unreadReleases(release(2))).toHaveLength(1);
    await act(async () => openReleaseNotes());
    expect(dialog()?.textContent).toContain("릴리즈 2"); expect(dialog()?.textContent).not.toContain("릴리즈 3");
    await click("업데이트 적용"); expect(mock.apply).toHaveBeenCalledWith(release(2).buildId);
    expect(unreadReleases(release(2))).toHaveLength(0);
  });
  it("requires rereading when the prepared worker changes, retaining language and focus", async () => {
    const trigger = document.createElement("button"); document.body.append(trigger);
    mock.path = "/intro"; mock.state = { status: "ready", offlineReady: true, prepared: release(2) };
    await render(release(1)); await act(async () => openReleaseNotes(trigger));
    await act(async () => { mock.state = { ...mock.state, prepared: release(3) }; mock.listeners.forEach((listener) => listener()); await setLanguage("en"); });
    expect(dialog()?.textContent).toContain("The prepared update changed");
    expect([...document.querySelectorAll("button")].some((button) => button.textContent === "Apply update")).toBe(false);
    await click("View update"); expect(dialog()?.textContent).toContain("Release 3");
    await click("Later"); await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(document.activeElement).toBe(trigger); trigger.remove();
  });
  it("does not mark a hidden or route-dismissed automatic dialog as read", async () => {
    observeRelease(release(1)); await render(); await tick();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await click("닫기"); expect(unreadReleases(release(2))).toHaveLength(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await tick(); expect(dialog()).not.toBeNull();
    mock.path = "/all"; await render(); expect(unreadReleases(release(2))).toHaveLength(1);
  });
  it("returns from skill management to the same notes without stacking dialogs", async () => {
    const value = release(2);
    value.history![1]!.skill = { compatibility: "compatible", notes: { ko: ["스킬 개선"], en: ["Skill improvement"] } };
    mock.path = "/intro";
    await render(value);
    await act(async () => openReleaseNotes());
    await click("스킬 업데이트");
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog()?.textContent).toContain("설치된 스킬 폴더 등록");
    await act(async () => { await setLanguage("en"); });
    await click("Close");
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog()?.textContent).toContain("Release 2");
    expect(dialog()?.textContent).toContain("Skill improvement");
  });
});

describe("one confirmation for app and registered skill", () => {
  async function open() {
    mock.path = "/intro"; mock.state = { status: "ready", offlineReady: true, prepared: release(2) };
    skills.state = "update";
    skills.review = { connection: { name: "test-skill" }, files: [{ path: "SKILL.md", content: "Before instructions\n" }], bundle: { version: "1234567890ab", files: [{ path: "SKILL.md", content: "After instructions\n" }] }, changes: [{ path: "SKILL.md", kind: "change" }] } as SkillReview;
    await render(release(1)); await act(async () => openReleaseNotes());
  }
  it("shows files and an advisory, with no stopped-task checkbox or writes on dismissal", async () => {
    await open();
    expect(dialog()?.textContent).toContain("SKILL.md");
    expect(dialog()?.textContent).toContain("다른 Alpha Kanban 앱의 스킬 변경을 마친 뒤 적용");
    expect(dialog()?.textContent).toContain("정식 제공 스킬");
    const details = dialog()!.querySelector("details")!;
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    expect(details.querySelector('[data-change="removed"] code')?.textContent).toBe("Before instructions");
    expect(details.querySelector('[data-change="added"] code')?.textContent).toBe("After instructions");
    expect(document.querySelector('[role="checkbox"]')).toBeNull();
    await click("나중에");
    expect(skills.approve).not.toHaveBeenCalled(); expect(mock.apply).not.toHaveBeenCalled();
  });
  it("durably approves the exact target before applying, and cancels when the app is blocked", async () => {
    await open(); mock.apply.mockResolvedValue(false);
    await click("백업 후 함께 업데이트");
    expect(skills.approve).toHaveBeenCalledWith(skills.review, release(1).buildId, release(2).buildId);
    expect(mock.apply).toHaveBeenCalledWith(release(2).buildId);
    expect(skills.approve.mock.invocationCallOrder[0]).toBeLessThan(mock.apply.mock.invocationCallOrder[0]!);
    expect(skills.cancel).toHaveBeenCalledWith("approval");
  });
  it("never applies the app when saving consent or the fresh skill check fails", async () => {
    await open(); skills.approve.mockRejectedValue(new Error("The skill changed outside this app. Compare it again before updating."));
    await click("백업 후 함께 업데이트");
    expect(mock.apply).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("allows an explicitly app-only update when the skill cannot be replaced", async () => {
    await open(); skills.state = "blocked"; skills.error = "Personal or unrecognized files will not be overwritten. Ask your agent to compare them.";
    await render(release(1)); await click("앱만 업데이트");
    expect(skills.approve).not.toHaveBeenCalled(); expect(mock.apply).toHaveBeenCalledWith(release(2).buildId);
  });
  it("cannot confirm before comparison finishes or approve twice during a pending apply", async () => {
    await open(); skills.state = "checking"; await render(release(1));
    expect([...document.querySelectorAll("button")].find((button) => button.textContent === "업데이트 적용")?.disabled).toBe(true);
    skills.state = "update"; await render(release(1));
    let finish!: (value: boolean) => void;
    mock.apply.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    mock.state = { ...mock.state, status: "blocked" }; await render(release(1));
    await click("백업 후 함께 업데이트"); await click("백업 후 함께 업데이트");
    expect(skills.approve).toHaveBeenCalledTimes(1);
    expect(dialog()?.textContent).not.toContain("다른 앱 창의 작성 중인 내용도");
    expect([...document.querySelectorAll("button")].find((button) => button.textContent === "나중에")?.disabled).toBe(true);
    await act(async () => finish(true)); expect(skills.cancel).not.toHaveBeenCalled();
  });
});
