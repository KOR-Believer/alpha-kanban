// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRelease } from "./client";
import { markNotified, markReleasesRead, observeRelease, parseHistory, unreadReleases, wasNotified, type ReleaseInfo, type ReleaseRecord } from "./releases";

export function release(sequence: number, id = "release-" + sequence): ReleaseInfo {
  const history: ReleaseRecord[] = Array.from({ length: sequence }, (_, index) => ({ id: "release-" + (index + 1), sequence: index + 1, date: "2026-10-26", notify: true, notes: { ko: ["변경 " + (index + 1)], en: ["Change " + (index + 1)] } }));
  history.at(-1)!.id = id;
  return { app: "alpha-kanban", protocol: 1, mode: "app", buildId: String(sequence).repeat(16), storageSchema: 1, skillBundle: "1234567890ab", skillVersion: null, documentFormat: null, releaseId: id, history, notes: history.at(-1)!.notes };
}
beforeEach(() => { localStorage.clear(); });
describe("release history contracts", () => {
  it("keeps the old-reader fields and validates their association with history", () => {
    const latest = release(3);
    expect(parseRelease(latest)).toBe(latest);
    const legacy = { ...latest }; delete legacy.history; delete legacy.releaseId;
    expect(parseRelease(legacy)).toBe(legacy);
    expect(() => parseRelease({ ...latest, notes: { ko: ["wrong"], en: ["wrong"] } })).toThrow();
    expect(() => parseRelease({ ...latest, releaseId: "release-1" })).toThrow();
    expect(() => parseRelease({ ...latest, history: undefined })).toThrow();
  });
  it("rejects untranslated, duplicate, unordered and invalid-date records", () => {
    const history = release(2).history!;
    for (const invalid of [[], [...history, history[0]], history.slice().reverse(), [{ ...history[0], date: "2026-02-30" }], [{ ...history[0], notes: { ko: ["a"], en: [] } }], [{ ...history[0], skill: { compatibility: "required", notes: history[0]!.notes } }]]) expect(() => parseHistory(invalid)).toThrow();
  });
  it("establishes a first-visit baseline and combines skipped releases", () => {
    observeRelease(release(1));
    expect(unreadReleases(release(1))).toEqual([]);
    observeRelease(release(3));
    expect(unreadReleases(release(3)).map((row) => row.sequence)).toEqual([2, 3]);
    expect(unreadReleases(release(1))).toEqual([]);
    markReleasesRead(release(2).history!);
    expect(unreadReleases(release(3)).map((row) => row.sequence)).toEqual([3]);
  });
  it("separates notice, reading, silent changes and same-release rebuilds", () => {
    observeRelease(release(1));
    const next = release(2);
    markNotified(next);
    expect(wasNotified({ ...next, buildId: "f".repeat(16) })).toBe(true);
    expect(unreadReleases(next)).toHaveLength(1);
    const silent = release(3); silent.history!.at(-1)!.notify = false;
    expect(unreadReleases(silent)).toHaveLength(1);
    markReleasesRead(next.history!);
    expect(unreadReleases(next)).toHaveLength(0);
    expect(unreadReleases({ ...next, buildId: "a".repeat(16) })).toHaveLength(0);
  });
  it("falls back to session memory if preferences are unavailable", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    const isolated = await import("./releases");
    isolated.observeRelease(release(1));
    isolated.markNotified(release(2));
    expect(isolated.wasNotified(release(2))).toBe(true);
    isolated.markReleasesRead(release(2).history!);
    expect(isolated.unreadReleases(release(2))).toEqual([]);
    storage.mockRestore();
  });
});
