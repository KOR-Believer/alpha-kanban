// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppInstaller } from "./install";

describe("installation availability", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("hides installation without an event and never retries a dismissed event", async () => {
    const installer = new AppInstaller();
    const stop = installer.start();
    expect(installer.getSnapshot().available).toBe(false);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "dismissed" }) });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(installer.getSnapshot().available).toBe(true);
    await installer.install(); await installer.install();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(installer.getSnapshot()).toMatchObject({ installed: false, available: false, prompting: false });
    stop();
  });

  it("only confirms installation from appinstalled, not prompt acceptance", async () => {
    const installer = new AppInstaller(); const stop = installer.start();
    window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "accepted" }) }));
    await installer.install();
    expect(installer.getSnapshot().installed).toBe(false);
    window.dispatchEvent(new Event("appinstalled"));
    expect(installer.getSnapshot()).toMatchObject({ installed: true, available: false });
    stop();
  });

  it("handles prompt rejection without changing preferences or folder storage", async () => {
    const installer = new AppInstaller(); const stop = installer.start();
    localStorage.setItem("alpha-kanban.locale", "ko");
    window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), { prompt: async () => { throw new Error("unavailable"); }, userChoice: Promise.resolve({ outcome: "dismissed" }) }));
    await installer.install();
    expect(installer.getSnapshot()).toMatchObject({ failed: true, available: false });
    expect(localStorage.getItem("alpha-kanban.locale")).toBe("ko");
    stop();
  });
});
